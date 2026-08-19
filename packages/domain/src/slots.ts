/**
 * Free-gap search. Turns working hours minus bookings into slots, and ranks the slots
 * that could carry one affected appointment.
 */

import { appointmentEnd } from './affected.js';
import { addBerlinDays, berlinDateTime, berlinDay, berlinWeekday, dayOffset } from './time.js';
import type {
  AffectedAppointment,
  Appointment,
  EngineInput,
  Location,
  Practitioner,
  Slot,
} from './types.js';

const MINUTE_MS = 60_000;

interface Span {
  from: number;
  to: number;
}

/** Free gaps of one practitioner on one Berlin day: working intervals minus that day's bookings. */
export function freeGaps(
  practitioner: Practitioner,
  day: string,
  appointments: Appointment[],
  locations: Location[],
): Slot[] {
  const weekday = berlinWeekday(berlinDateTime(day, '12:00'));
  const intervals = practitioner.workingHours[weekday] ?? [];
  if (intervals.length === 0) return [];

  const busy: Span[] = appointments
    .filter(
      (a) =>
        a.status === 'booked' &&
        a.terminoPractitionerId === practitioner.terminoPractitionerId &&
        berlinDay(a.startsAt) === day,
    )
    .map((a) => ({ from: a.startsAt.getTime(), to: appointmentEnd(a).getTime() }))
    .sort((a, b) => a.from - b.from);

  const gaps: Slot[] = [];
  for (const interval of intervals) {
    // A working interval at an unknown location cannot become a bookable slot; drop it rather than guess.
    const location = locations.find((l) => l.id === interval.locationId);
    if (!location) continue;

    let cursor = berlinDateTime(day, interval.from).getTime();
    const end = berlinDateTime(day, interval.to).getTime();
    for (const span of busy) {
      if (span.to <= cursor) continue;
      if (span.from >= end) break;
      if (span.from > cursor) {
        gaps.push(toSlot(practitioner, location.terminoLocationId, cursor, Math.min(span.from, end)));
      }
      cursor = Math.max(cursor, span.to);
      if (cursor >= end) break;
    }
    if (cursor < end) gaps.push(toSlot(practitioner, location.terminoLocationId, cursor, end));
  }
  return gaps.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function toSlot(
  practitioner: Practitioner,
  terminoLocationId: string,
  from: number,
  to: number,
): Slot {
  return {
    terminoPractitionerId: practitioner.terminoPractitionerId,
    terminoLocationId,
    startsAt: new Date(from),
    endsAt: new Date(to),
  };
}

/** Slots of qualified colleagues that could carry the affected appointment, best first. */
export function findCandidateSlots(
  affected: AffectedAppointment,
  input: EngineInput,
  opts: { days: string[] },
): Slot[] {
  const appointment = affected.appointment;
  const code = appointment.serviceCode;
  // An unmapped service label cannot be matched against qualifications; stay conservative and offer nothing.
  if (!code) return [];

  const durationMs = appointment.durationMin * MINUTE_MS;
  const originalDay = berlinDay(appointment.startsAt);
  const originalTime = berlinWallTime(appointment.startsAt);

  const colleagues = input.practitioners.filter(
    (p) =>
      p.terminoPractitionerId !== input.absentPractitioner.terminoPractitionerId &&
      p.qualifications.includes(code),
  );

  const bySlotKey = new Map<string, Slot>();
  for (const colleague of colleagues) {
    for (const day of opts.days) {
      for (const gap of freeGaps(colleague, day, input.appointments, input.locations)) {
        const gapFrom = gap.startsAt.getTime();
        const gapTo = gap.endsAt.getTime();
        if (gapTo - gapFrom < durationMs) continue;

        const starts = [gapFrom];
        // Keeping the original time of day is the least disruptive move, so offer it when it fits.
        const atOriginalTime = berlinDateTime(day, originalTime).getTime();
        if (atOriginalTime >= gapFrom && atOriginalTime + durationMs <= gapTo) {
          starts.push(atOriginalTime);
        }
        for (const start of starts) {
          if (start < input.now.getTime()) continue;
          const slot: Slot = {
            terminoPractitionerId: gap.terminoPractitionerId,
            terminoLocationId: gap.terminoLocationId,
            startsAt: new Date(start),
            endsAt: new Date(start + durationMs),
          };
          bySlotKey.set(`${slot.terminoPractitionerId}|${start}`, slot);
        }
      }
    }
  }

  return [...bySlotKey.values()].sort((a, b) => {
    const sameDayA = berlinDay(a.startsAt) === originalDay ? 0 : 1;
    const sameDayB = berlinDay(b.startsAt) === originalDay ? 0 : 1;
    if (sameDayA !== sameDayB) return sameDayA - sameDayB;

    const sameLocationA = a.terminoLocationId === appointment.terminoLocationId ? 0 : 1;
    const sameLocationB = b.terminoLocationId === appointment.terminoLocationId ? 0 : 1;
    if (sameLocationA !== sameLocationB) return sameLocationA - sameLocationB;

    const distanceA = Math.abs(a.startsAt.getTime() - appointment.startsAt.getTime());
    const distanceB = Math.abs(b.startsAt.getTime() - appointment.startsAt.getTime());
    if (distanceA !== distanceB) return distanceA - distanceB;

    return a.terminoPractitionerId.localeCompare(b.terminoPractitionerId);
  });
}

/** The Berlin days to search around an affected appointment, given the policy window. */
export function searchDays(appointment: Appointment, maxDayOffset: number): string[] {
  const base = berlinDay(appointment.startsAt);
  const days: string[] = [];
  for (let offset = -maxDayOffset; offset <= maxDayOffset; offset += 1) {
    days.push(addBerlinDays(base, offset));
  }
  return [...new Set(days)];
}

/** Whether a slot sits on the same Berlin day as the appointment. */
export function isSameBerlinDay(slot: Slot, appointment: Appointment): boolean {
  return dayOffset(slot.startsAt, appointment.startsAt) === 0;
}

function berlinWallTime(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(instant)
    .replace('24:', '00:');
}
