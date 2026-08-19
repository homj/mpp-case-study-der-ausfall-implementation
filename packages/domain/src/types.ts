/**
 * Domain types. Pure data, no I/O. Vocabulary follows CONTEXT.md.
 * All instants are UTC `Date`s; wall-clock times in working hours are "HH:MM" Europe/Berlin.
 */

export type ServiceCode = 'KG' | 'MT' | 'MLD45' | 'KGG';
export const SERVICE_CODES: readonly ServiceCode[] = ['KG', 'MT', 'MLD45', 'KGG'] as const;

export type Weekday = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so';

export type TenantId = string;
export type LocationId = string; // our id
export type TerminoLocationId = string; // e.g. "loc_01"
export type PractitionerId = string; // our id
export type TerminoPractitionerId = string; // e.g. "prac_01"
export type PatientId = string; // our id
export type TerminoPatientId = string; // e.g. "pat_02026"
export type TerminoAppointmentId = string; // e.g. "apt_000001"
export type PrescriptionId = string;
export type AbsenceId = string;
export type RescheduleTaskId = string;

export interface Location {
  id: LocationId;
  terminoLocationId: TerminoLocationId;
  name: string;
  address: string;
}

export interface WorkingInterval {
  from: string; // "HH:MM" Berlin
  to: string; // "HH:MM" Berlin
  locationId: LocationId;
}

export interface Practitioner {
  id: PractitionerId;
  terminoPractitionerId: TerminoPractitionerId;
  firstName: string;
  lastName: string;
  qualifications: ServiceCode[];
  workingHours: Partial<Record<Weekday, WorkingInterval[]>>;
}

/** Our master-data patient. */
export interface Patient {
  id: PatientId;
  terminoPatientId: TerminoPatientId | null;
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  phone: string | null;
  email: string | null;
}

/** The patient copy as Termino exports it. */
export interface TerminoPatient {
  terminoPatientId: TerminoPatientId;
  name: string;
  birthDate: string;
  phone: string | null;
  email: string | null;
}

export interface Prescription {
  id: PrescriptionId;
  patientId: PatientId;
  issuedOn: string; // YYYY-MM-DD
  diagnosisGroup: string;
  serviceCode: ServiceCode;
  units: number; // verordnungsmenge
  frequencyPerWeek: number;
}

export type AppointmentStatus = 'booked' | 'cancelled';

export interface Appointment {
  terminoAppointmentId: TerminoAppointmentId;
  terminoLocationId: TerminoLocationId;
  terminoPractitionerId: TerminoPractitionerId;
  serviceLabel: string; // Termino label, e.g. "Krankengymnastik"
  serviceCode: ServiceCode | null; // mapped; null when unknown label
  startsAt: Date; // UTC
  durationMin: number;
  status: AppointmentStatus;
  patient: TerminoPatient;
  bookedAt: Date;
  updatedAt: Date;
}

export type AbsenceCategory = 'sick' | 'emergency' | 'planned' | 'other';

export interface Absence {
  id: AbsenceId;
  practitionerId: PractitionerId;
  category: AbsenceCategory;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
}

/** A booked appointment of the absent practitioner overlapping the absence window. */
export interface AffectedAppointment {
  appointment: Appointment;
  /** Already running when the absence starts (or when `now` is inside it). */
  inProgress: boolean;
  /** Past or starting within the imminent threshold relative to `now`. */
  imminent: boolean;
}

export interface Slot {
  terminoPractitionerId: TerminoPractitionerId;
  terminoLocationId: TerminoLocationId;
  startsAt: Date;
  endsAt: Date;
}

/** Product rule, data not code (ADR-0004). */
export interface AutoRebookPolicy {
  requireSameLocation: boolean;
  /** Max |day offset| between original and new slot (Berlin calendar days). */
  maxDayOffset: number;
  requireContactable: boolean;
  /** Appointments starting within this many minutes of `now` (or already started) are imminent. */
  imminentThresholdMin: number;
}

export const DEFAULT_AUTO_REBOOK_POLICY: AutoRebookPolicy = {
  requireSameLocation: true,
  maxDayOffset: 2,
  requireContactable: true,
  imminentThresholdMin: 30,
};

export type PrescriptionWarningCode =
  | 'no_prescription'
  | 'start_deadline' // first treatment must start within 28 days of issue
  | 'interruption' // > 14 days between treatments (estimate, window-limited)
  | 'below_frequency' // this week falls below frequencyPerWeek
  | 'units_nearly_used'; // in-window count >= units - 1 (estimate)

export interface PrescriptionWarning {
  code: PrescriptionWarningCode;
  detail: string;
}

/** What the engine decides for one affected appointment. */
export type EngineDecision =
  | {
      kind: 'auto_rebook';
      slot: Slot;
      /** true when the new slot is on another day → message carries "today cancelled + new slot". */
      todayCancelled: boolean;
    }
  | {
      kind: 'swap_proposal'; // imminent: same time + location, other practitioner
      slot: Slot;
    }
  | {
      kind: 'proposal'; // slots exist but outside auto criteria (cross-location / outside window)
      candidates: Slot[];
      sameDayImpossible: boolean; // → cancellation notice for today goes out now
    }
  | {
      kind: 'front_desk';
      reason: 'in_progress' | 'imminent_no_swap' | 'no_slot' | 'not_contactable';
      candidates: Slot[];
      sameDayImpossible: boolean;
    };

export interface AffectedAppointmentDecision {
  affected: AffectedAppointment;
  decision: EngineDecision;
  warnings: PrescriptionWarning[];
  /** true when the same patient has another affected appointment on the same Berlin day. */
  duplicateSameDay: boolean;
}

export type RescheduleTaskStatus = 'open' | 'in_progress' | 'retry_contact' | 'resolved';

export type Resolution =
  | 'rebooked'
  | 'swapped'
  | 'cancelled'
  | 'kept'
  | 'completed'
  | 'aborted'
  | 'resolved_externally';

/** Input the engine needs; the API assembles it from repositories. */
export interface EngineInput {
  now: Date;
  absence: Absence;
  absentPractitioner: Practitioner;
  practitioners: Practitioner[]; // all, incl. absent one
  locations: Location[];
  /** All booked + cancelled appointments in the export window (all practitioners). */
  appointments: Appointment[];
  /** Master patients keyed by terminoPatientId (only matched ones). */
  patientsByTerminoId: ReadonlyMap<TerminoPatientId, Patient>;
  prescriptionsByPatientId: ReadonlyMap<PatientId, Prescription[]>;
  policy: AutoRebookPolicy;
}
