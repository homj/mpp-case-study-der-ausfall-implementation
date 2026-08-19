/**
 * Finds the appointments an absence hits, and flags the two time-critical cases
 * (in progress, imminent) the engine must never rebook silently.
 */

import type { AffectedAppointment, Appointment, EngineInput } from './types.js';

const MINUTE_MS = 60_000;

/** End instant of an appointment. */
export function appointmentEnd(appointment: Appointment): Date {
  return new Date(appointment.startsAt.getTime() + appointment.durationMin * MINUTE_MS);
}

/** Booked appointments of the absent practitioner that overlap the absence, sorted by start time. */
export function findAffectedAppointments(input: EngineInput): AffectedAppointment[] {
  const { absence, absentPractitioner, appointments, now, policy } = input;
  // "In progress" is judged at the first moment the absence bites: the later of `now` and the absence start.
  const referenceInstant = new Date(Math.max(now.getTime(), absence.startsAt.getTime()));
  const imminentUntil = new Date(now.getTime() + policy.imminentThresholdMin * MINUTE_MS);

  return appointments
    .filter(
      (a) =>
        a.status === 'booked' &&
        a.terminoPractitionerId === absentPractitioner.terminoPractitionerId &&
        a.startsAt.getTime() < absence.endsAt.getTime() &&
        appointmentEnd(a).getTime() > absence.startsAt.getTime(),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((appointment) => {
      const inProgress =
        appointment.startsAt.getTime() < referenceInstant.getTime() &&
        referenceInstant.getTime() < appointmentEnd(appointment).getTime();
      const imminent = !inProgress && appointment.startsAt.getTime() <= imminentUntil.getTime();
      return { appointment, inProgress, imminent };
    });
}
