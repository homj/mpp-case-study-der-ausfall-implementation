/**
 * The resolution engine. Greedy, earliest affected appointment first: resolve the clean cases,
 * hand everything else to the front desk with the reason (analysis §3 and §5).
 */

import { appointmentEnd, findAffectedAppointments } from './affected.js';
import { isAutoRebookable, isContactable } from './policy.js';
import { findCandidateSlots, freeGaps, searchDays } from './slots.js';
import { berlinDay } from './time.js';
import { prescriptionWarnings } from './warnings.js';
import type {
  AffectedAppointment,
  AffectedAppointmentDecision,
  EngineDecision,
  EngineInput,
  Slot,
} from './types.js';

interface Reservation {
  terminoPractitionerId: string;
  from: number;
  to: number;
}

/** One decision per affected appointment, in start order, with no slot handed out twice. */
export function decide(input: EngineInput): AffectedAppointmentDecision[] {
  const affectedList = findAffectedAppointments(input);
  const reservations: Reservation[] = [];

  return affectedList.map((affected) => ({
    affected,
    decision: decideOne(affected, input, reservations),
    warnings: prescriptionWarnings(affected, input),
    duplicateSameDay: hasDuplicateSameDay(affected, affectedList),
  }));
}

function decideOne(
  affected: AffectedAppointment,
  input: EngineInput,
  reservations: Reservation[],
): EngineDecision {
  const appointment = affected.appointment;

  // The patient is on the table; a human at the practice finishes this one.
  if (affected.inProgress) {
    return { kind: 'front_desk', reason: 'in_progress', candidates: [], sameDayImpossible: false };
  }

  // The patient is likely already travelling. Never cancel; swap the practitioner or call.
  if (affected.imminent) {
    const swap = findSwapSlot(affected, input, reservations);
    if (swap) {
      reserve(reservations, swap);
      return { kind: 'swap_proposal', slot: swap };
    }
    return {
      kind: 'front_desk',
      reason: 'imminent_no_swap',
      candidates: [],
      sameDayImpossible: false,
    };
  }

  const days = searchDays(appointment, input.policy.maxDayOffset);
  const candidates = findCandidateSlots(affected, input, { days }).filter(
    (slot) => !isReserved(reservations, slot),
  );

  // A slot at the other location is a human decision, so it never counts as same-day coverage.
  const originalDay = berlinDay(appointment.startsAt);
  const sameDayImpossible = !candidates.some(
    (slot) =>
      berlinDay(slot.startsAt) === originalDay &&
      slot.terminoLocationId === appointment.terminoLocationId,
  );

  const autoSlot = candidates.find((slot) => isAutoRebookable(affected, slot, input));
  if (autoSlot) {
    // We only act on our own when we can tell the patient about it.
    if (!isContactable(appointment.patient)) {
      return { kind: 'proposal', candidates, sameDayImpossible };
    }
    reserve(reservations, autoSlot);
    return {
      kind: 'auto_rebook',
      slot: autoSlot,
      todayCancelled: berlinDay(autoSlot.startsAt) !== originalDay,
    };
  }

  if (candidates.length > 0) {
    return { kind: 'proposal', candidates, sameDayImpossible };
  }

  return {
    kind: 'front_desk',
    reason: isContactable(appointment.patient) ? 'no_slot' : 'not_contactable',
    candidates: [],
    sameDayImpossible,
  };
}

/** A qualified colleague free at exactly the original time and location. */
function findSwapSlot(
  affected: AffectedAppointment,
  input: EngineInput,
  reservations: Reservation[],
): Slot | null {
  const appointment = affected.appointment;
  const code = appointment.serviceCode;
  if (!code) return null;

  const day = berlinDay(appointment.startsAt);
  const from = appointment.startsAt.getTime();
  const to = appointmentEnd(appointment).getTime();

  for (const colleague of input.practitioners) {
    if (colleague.terminoPractitionerId === input.absentPractitioner.terminoPractitionerId) continue;
    if (!colleague.qualifications.includes(code)) continue;

    for (const gap of freeGaps(colleague, day, input.appointments, input.locations)) {
      if (gap.terminoLocationId !== appointment.terminoLocationId) continue;
      if (gap.startsAt.getTime() > from || gap.endsAt.getTime() < to) continue;
      const slot: Slot = {
        terminoPractitionerId: colleague.terminoPractitionerId,
        terminoLocationId: gap.terminoLocationId,
        startsAt: new Date(from),
        endsAt: new Date(to),
      };
      if (isReserved(reservations, slot)) continue;
      return slot;
    }
  }
  return null;
}

function reserve(reservations: Reservation[], slot: Slot): void {
  reservations.push({
    terminoPractitionerId: slot.terminoPractitionerId,
    from: slot.startsAt.getTime(),
    to: slot.endsAt.getTime(),
  });
}

function isReserved(reservations: Reservation[], slot: Slot): boolean {
  return reservations.some(
    (r) =>
      r.terminoPractitionerId === slot.terminoPractitionerId &&
      r.from < slot.endsAt.getTime() &&
      r.to > slot.startsAt.getTime(),
  );
}

function hasDuplicateSameDay(
  affected: AffectedAppointment,
  all: AffectedAppointment[],
): boolean {
  const day = berlinDay(affected.appointment.startsAt);
  const patientId = affected.appointment.patient.terminoPatientId;
  return all.some(
    (other) =>
      other !== affected &&
      other.appointment.patient.terminoPatientId === patientId &&
      berlinDay(other.appointment.startsAt) === day,
  );
}
