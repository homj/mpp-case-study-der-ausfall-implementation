/**
 * The auto-rebook rule, read from `AutoRebookPolicy` data instead of scattered conditions (ADR-0004).
 * The qualification gate is already applied by the candidate search, so it is not re-checked here.
 */

import { dayOffset } from './time.js';
import type { AffectedAppointment, EngineInput, Slot, TerminoPatient } from './types.js';

/** A patient we can reach without a phone call from the front desk. */
export function isContactable(patient: TerminoPatient): boolean {
  return Boolean(patient.phone) || Boolean(patient.email);
}

/** Whether the engine may move the appointment into this slot without asking a human. */
export function isAutoRebookable(
  affected: AffectedAppointment,
  slot: Slot,
  input: EngineInput,
): boolean {
  const { policy } = input;
  const appointment = affected.appointment;

  if (policy.requireSameLocation && slot.terminoLocationId !== appointment.terminoLocationId) {
    return false;
  }
  if (Math.abs(dayOffset(slot.startsAt, appointment.startsAt)) > policy.maxDayOffset) {
    return false;
  }
  if (policy.requireContactable && !isContactable(appointment.patient)) {
    return false;
  }
  return true;
}
