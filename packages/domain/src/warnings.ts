/**
 * Prescription-continuity warnings. They are soft signals for the front desk, never hard blocks:
 * the export window starts mid-treatment, so every count is a lower bound (analysis F4).
 */

import { addBerlinDays, berlinDay, berlinIsoWeek, daysBetweenBerlinDays } from './time.js';
import type {
  AffectedAppointment,
  Appointment,
  EngineInput,
  Prescription,
  PrescriptionWarning,
} from './types.js';

const ESTIMATE_NOTE = '(estimate, export window limited)';
const START_DEADLINE_DAYS = 28;
const INTERRUPTION_DAYS = 14;

/** Prescription warnings for one affected appointment, based on the export window we can see. */
export function prescriptionWarnings(
  affected: AffectedAppointment,
  input: EngineInput,
): PrescriptionWarning[] {
  const appointment = affected.appointment;
  const master = input.patientsByTerminoId.get(appointment.patient.terminoPatientId);
  if (!master) return [{ code: 'no_prescription', detail: 'unmatched patient' }];

  const all = input.prescriptionsByPatientId.get(master.id) ?? [];
  const matching = all.filter((rx) => rx.serviceCode === appointment.serviceCode);
  // Exactly one prescription per patient in this data set; fall back to any so a mislabelled
  // service does not hide the continuity risk.
  const prescription = matching[0] ?? all[0];
  if (!prescription) {
    return [{ code: 'no_prescription', detail: 'no prescription on file for this patient' }];
  }

  const today = berlinDay(input.now);
  const history = input.appointments.filter(
    (a) =>
      a.status === 'booked' &&
      a.patient.terminoPatientId === appointment.patient.terminoPatientId &&
      a.serviceCode === prescription.serviceCode,
  );

  const warnings: PrescriptionWarning[] = [];
  pushStartDeadline(warnings, prescription, history, today);
  pushUnitsNearlyUsed(warnings, prescription, history, today);
  pushBelowFrequency(warnings, prescription, history, appointment);
  pushInterruption(warnings, history, appointment, input.now, today);
  return warnings;
}

function pushStartDeadline(
  warnings: PrescriptionWarning[],
  prescription: Prescription,
  history: Appointment[],
  today: string,
): void {
  const startedBeforeToday = history.some((a) => berlinDay(a.startsAt) < today);
  if (startedBeforeToday) return;
  const deadline = addBerlinDays(prescription.issuedOn, START_DEADLINE_DAYS);
  if (deadline > today) return;
  const days = daysBetweenBerlinDays(today, prescription.issuedOn);
  warnings.push({
    code: 'start_deadline',
    detail: `Issued ${prescription.issuedOn}, ${days} days ago, with no treatment recorded before today ${ESTIMATE_NOTE}`,
  });
}

function pushUnitsNearlyUsed(
  warnings: PrescriptionWarning[],
  prescription: Prescription,
  history: Appointment[],
  today: string,
): void {
  const used = history.filter((a) => berlinDay(a.startsAt) <= today).length;
  if (used < prescription.units - 1) return;
  warnings.push({
    code: 'units_nearly_used',
    detail: `${used} of ${prescription.units} units used up to today ${ESTIMATE_NOTE}`,
  });
}

function pushBelowFrequency(
  warnings: PrescriptionWarning[],
  prescription: Prescription,
  history: Appointment[],
  appointment: Appointment,
): void {
  const week = berlinIsoWeek(appointment.startsAt);
  const remaining = history.filter(
    (a) =>
      a.terminoAppointmentId !== appointment.terminoAppointmentId &&
      berlinIsoWeek(a.startsAt) === week,
  ).length;
  if (remaining >= prescription.frequencyPerWeek) return;
  warnings.push({
    code: 'below_frequency',
    detail: `${remaining} of ${prescription.frequencyPerWeek} treatments left in week ${week} if this appointment falls out`,
  });
}

function pushInterruption(
  warnings: PrescriptionWarning[],
  history: Appointment[],
  appointment: Appointment,
  now: Date,
  today: string,
): void {
  const others = history.filter(
    (a) => a.terminoAppointmentId !== appointment.terminoAppointmentId,
  );
  const past = others
    .filter((a) => a.startsAt.getTime() < now.getTime())
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  if (!past) return;
  const lastDay = berlinDay(past.startsAt);

  const next = others
    .filter((a) => a.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  if (next) {
    const gap = daysBetweenBerlinDays(berlinDay(next.startsAt), lastDay);
    if (gap <= INTERRUPTION_DAYS) return;
    warnings.push({
      code: 'interruption',
      detail: `${gap} days between ${lastDay} and the next treatment on ${berlinDay(next.startsAt)} ${ESTIMATE_NOTE}`,
    });
    return;
  }

  const sinceLast = daysBetweenBerlinDays(today, lastDay);
  if (sinceLast <= INTERRUPTION_DAYS) return;
  warnings.push({
    code: 'interruption',
    detail: `${sinceLast} days since ${lastDay} with no follow-up booked ${ESTIMATE_NOTE}`,
  });
}
