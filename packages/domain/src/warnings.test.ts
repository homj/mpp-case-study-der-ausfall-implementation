import { describe, expect, it } from 'vitest';
import { findAffectedAppointments } from './affected.js';
import {
  appointment,
  engineInput,
  masterPatient,
  practitioner,
  prescription,
  terminoPatient,
} from './testing/fixtures.js';
import { prescriptionWarnings } from './warnings.js';
import type { Appointment, Prescription, PrescriptionWarningCode } from './types.js';

const MONDAY = '2026-09-07'; // now = 07:40 Berlin
const absent = practitioner('prac_01', ['KG', 'MT', 'MLD45'], {});
const patient = terminoPatient('pat_01');

function appt(id: string, day: string, at: string, code: 'KG' | 'MT' = 'KG'): Appointment {
  return appointment({
    id,
    day,
    at,
    durationMin: 20,
    practitioner: 'prac_01',
    location: 'loc_01',
    serviceCode: code,
    patient,
  });
}

const affectedAppointment = appt('apt_today', MONDAY, '09:20');

function codesFor(options: {
  history?: Appointment[];
  prescriptions?: Prescription[];
  matched?: boolean;
}): PrescriptionWarningCode[] {
  const master = masterPatient('m1', patient.terminoPatientId);
  const input = engineInput({
    absentPractitioner: absent,
    practitioners: [absent],
    appointments: [affectedAppointment, ...(options.history ?? [])],
    patients: options.matched === false ? [] : [master],
    prescriptions: options.prescriptions ?? [prescription('rx1', 'm1', 'KG')],
  });
  const affected = findAffectedAppointments(input)[0]!;
  return prescriptionWarnings(affected, input).map((w) => w.code);
}

describe('prescriptionWarnings', () => {
  it('reports an unmatched patient as a missing prescription', () => {
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent],
      appointments: [affectedAppointment],
    });
    const affected = findAffectedAppointments(input)[0]!;
    expect(prescriptionWarnings(affected, input)).toEqual([
      { code: 'no_prescription', detail: 'unmatched patient' },
    ]);
  });

  it('reports a matched patient without any prescription', () => {
    expect(codesFor({ prescriptions: [] })).toEqual(['no_prescription']);
  });

  it('warns when treatment has not started within 28 days of the issue date', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { issuedOn: '2026-08-10', frequencyPerWeek: 1 })],
      history: [appt('apt_next', '2026-09-09', '09:00')],
    });
    expect(codes).toContain('start_deadline');
  });

  it('does not warn about the start deadline once a treatment happened before today', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { issuedOn: '2026-08-10', frequencyPerWeek: 1 })],
      history: [appt('apt_past', '2026-08-25', '09:00'), appt('apt_next', '2026-09-09', '09:00')],
    });
    expect(codes).not.toContain('start_deadline');
  });

  it('warns when the in-window unit count reaches units minus one', () => {
    const history = ['2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03'].map((day, i) =>
      appt(`apt_${i}`, day, '09:00'),
    );
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { units: 6, frequencyPerWeek: 1 })],
      history,
    });
    expect(codes).toContain('units_nearly_used');
  });

  it('warns when losing the appointment drops the patient below the weekly frequency', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { frequencyPerWeek: 2, units: 20 })],
      history: [],
    });
    expect(codes).toContain('below_frequency');
  });

  it('does not warn about frequency when another appointment covers the same ISO week', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { frequencyPerWeek: 1, units: 20 })],
      history: [appt('apt_thu', '2026-09-10', '09:00')],
    });
    expect(codes).not.toContain('below_frequency');
  });

  it('warns about an interruption longer than 14 days between the last and the next treatment', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { frequencyPerWeek: 1, units: 20 })],
      history: [appt('apt_past', '2026-08-24', '09:00'), appt('apt_next', '2026-09-11', '09:00')],
    });
    expect(codes).toContain('interruption');
  });

  it('does not warn about an interruption when the next treatment follows within 14 days', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'KG', { frequencyPerWeek: 1, units: 20 })],
      history: [appt('apt_past', '2026-09-03', '09:00'), appt('apt_next', '2026-09-09', '09:00')],
    });
    expect(codes).not.toContain('interruption');
  });

  it('falls back to a prescription of another service when none matches the service code', () => {
    const codes = codesFor({
      prescriptions: [prescription('rx1', 'm1', 'MT', { frequencyPerWeek: 1, units: 20 })],
      history: [],
    });
    expect(codes).not.toContain('no_prescription');
  });

  it('labels the window-limited estimates in the detail text', () => {
    const master = masterPatient('m1', patient.terminoPatientId);
    const history = ['2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03'].map((day, i) =>
      appt(`apt_${i}`, day, '09:00'),
    );
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent],
      appointments: [affectedAppointment, ...history],
      patients: [master],
      prescriptions: [prescription('rx1', 'm1', 'KG', { units: 6, frequencyPerWeek: 1 })],
    });
    const affected = findAffectedAppointments(input)[0]!;
    const units = prescriptionWarnings(affected, input).find((w) => w.code === 'units_nearly_used');
    expect(units?.detail).toContain('(estimate, export window limited)');
  });
});
