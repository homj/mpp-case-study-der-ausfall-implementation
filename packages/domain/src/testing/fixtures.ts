/**
 * Hand-built fixtures for the domain tests. They mirror the real data shapes but read nothing from disk.
 */

import { berlinDateTime } from '../time.js';
import {
  DEFAULT_AUTO_REBOOK_POLICY,
  type Appointment,
  type EngineInput,
  type Location,
  type Patient,
  type Practitioner,
  type Prescription,
  type ServiceCode,
  type TerminoPatient,
  type Weekday,
  type WorkingInterval,
} from '../types.js';

export const MITTE: Location = {
  id: 'l1',
  terminoLocationId: 'loc_01',
  name: 'Mitte',
  address: 'Mittestrasse 1, Berlin',
};

export const KREUZBERG: Location = {
  id: 'l2',
  terminoLocationId: 'loc_02',
  name: 'Kreuzberg',
  address: 'Kreuzbergstrasse 2, Berlin',
};

export const LOCATIONS: Location[] = [MITTE, KREUZBERG];

/** Builds a working interval for a location id. */
export function shift(from: string, to: string, locationId: string): WorkingInterval {
  return { from, to, locationId };
}

/** Builds a practitioner with qualifications and weekday working hours. */
export function practitioner(
  terminoPractitionerId: string,
  qualifications: ServiceCode[],
  workingHours: Partial<Record<Weekday, WorkingInterval[]>>,
  lastName = terminoPractitionerId,
): Practitioner {
  return {
    id: `p-${terminoPractitionerId}`,
    terminoPractitionerId,
    firstName: 'Test',
    lastName,
    qualifications,
    workingHours,
  };
}

/** Builds the Termino copy of a patient. */
export function terminoPatient(
  terminoPatientId: string,
  overrides: Partial<TerminoPatient> = {},
): TerminoPatient {
  return {
    terminoPatientId,
    name: `Patient ${terminoPatientId}`,
    birthDate: '1980-01-01',
    phone: '+49301234567',
    email: `${terminoPatientId}@example.test`,
    ...overrides,
  };
}

/** Builds our master-data patient. */
export function masterPatient(
  id: string,
  terminoPatientId: string | null,
  overrides: Partial<Patient> = {},
): Patient {
  return {
    id,
    terminoPatientId,
    firstName: 'Test',
    lastName: id,
    birthDate: '1980-01-01',
    phone: '+49301234567',
    email: `${id}@example.test`,
    ...overrides,
  };
}

/** Builds a prescription. */
export function prescription(
  id: string,
  patientId: string,
  serviceCode: ServiceCode,
  overrides: Partial<Prescription> = {},
): Prescription {
  return {
    id,
    patientId,
    issuedOn: '2026-08-31',
    diagnosisGroup: 'WS',
    serviceCode,
    units: 10,
    frequencyPerWeek: 2,
    ...overrides,
  };
}

const SERVICE_LABELS: Record<ServiceCode, string> = {
  KG: 'Krankengymnastik',
  MT: 'Manuelle Therapie',
  MLD45: 'Lymphdrainage 45 Min.',
  KGG: 'Geraetegestuetzte Krankengymnastik',
};

export interface AppointmentSpec {
  id: string;
  day: string; // Berlin YYYY-MM-DD
  at: string; // Berlin HH:MM
  durationMin: number;
  practitioner: string; // terminoPractitionerId
  location: string; // terminoLocationId
  serviceCode: ServiceCode | null;
  patient: TerminoPatient;
  status?: 'booked' | 'cancelled';
}

/** Builds an appointment from Berlin wall-clock parts. */
export function appointment(spec: AppointmentSpec): Appointment {
  const startsAt = berlinDateTime(spec.day, spec.at);
  return {
    terminoAppointmentId: spec.id,
    terminoLocationId: spec.location,
    terminoPractitionerId: spec.practitioner,
    serviceLabel: spec.serviceCode ? SERVICE_LABELS[spec.serviceCode] : 'Unbekannt',
    serviceCode: spec.serviceCode,
    startsAt,
    durationMin: spec.durationMin,
    status: spec.status ?? 'booked',
    patient: spec.patient,
    bookedAt: new Date('2026-08-24T08:00:00Z'),
    updatedAt: new Date('2026-08-24T08:00:00Z'),
  };
}

/** Fills a practitioner's day with back-to-back bookings so only the wanted gaps stay free. */
export function block(
  terminoPractitionerId: string,
  location: string,
  day: string,
  from: string,
  durationMin: number,
  index: number,
): Appointment {
  return appointment({
    id: `blk_${terminoPractitionerId}_${day}_${index}`,
    day,
    at: from,
    durationMin,
    practitioner: terminoPractitionerId,
    location,
    serviceCode: 'KG',
    patient: terminoPatient(`pat_block_${index}`),
  });
}

export interface EngineInputOverrides extends Partial<EngineInput> {
  patients?: Patient[];
  prescriptions?: Prescription[];
}

/** Builds an EngineInput, defaulting everything the test does not care about. */
export function engineInput(overrides: EngineInputOverrides): EngineInput {
  const { patients, prescriptions, ...rest } = overrides;
  const patientsByTerminoId = new Map<string, Patient>();
  for (const p of patients ?? []) {
    if (p.terminoPatientId) patientsByTerminoId.set(p.terminoPatientId, p);
  }
  const prescriptionsByPatientId = new Map<string, Prescription[]>();
  for (const rx of prescriptions ?? []) {
    const list = prescriptionsByPatientId.get(rx.patientId) ?? [];
    list.push(rx);
    prescriptionsByPatientId.set(rx.patientId, list);
  }
  const absentPractitioner =
    rest.absentPractitioner ?? practitioner('prac_01', ['KG', 'MT', 'MLD45'], {});
  return {
    now: new Date('2026-09-07T05:40:00Z'),
    absence: {
      id: 'abs_1',
      practitionerId: absentPractitioner.id,
      category: 'sick',
      startsAt: new Date('2026-09-07T05:40:00Z'),
      endsAt: new Date('2026-09-07T22:00:00Z'),
      note: null,
    },
    absentPractitioner,
    practitioners: [absentPractitioner],
    locations: LOCATIONS,
    appointments: [],
    policy: DEFAULT_AUTO_REBOOK_POLICY,
    ...rest,
    patientsByTerminoId: rest.patientsByTerminoId ?? patientsByTerminoId,
    prescriptionsByPatientId: rest.prescriptionsByPatientId ?? prescriptionsByPatientId,
  };
}
