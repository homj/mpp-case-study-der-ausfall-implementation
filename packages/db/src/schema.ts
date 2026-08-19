/**
 * Drizzle schema. Conventions:
 * - Every table carries `tenant_id` (ADR-0003) and `created_at`.
 * - Column names are snake_case; all instants are `timestamptz` in UTC.
 * - Enum-like columns stay `text` with a TypeScript union, so a new value needs
 *   no migration and the type checker still guards every write.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AbsenceCategory,
  AppointmentStatus,
  EngineDecision,
  PrescriptionWarning,
  Resolution,
  RescheduleTaskStatus,
  ServiceCode,
  TerminoPatient,
  Weekday,
  WorkingInterval,
} from '@ausfall/domain';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/**
 * The practice group. Its `id` is the tenant id, so this table needs no
 * separate `tenant_id` column; every other table references it.
 */
export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt,
});

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminoLocationId: text('termino_location_id').notNull().unique(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    createdAt,
  },
  (table) => [index('locations_tenant_idx').on(table.tenantId)],
);

export const practitioners = pgTable(
  'practitioners',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminoPractitionerId: text('termino_practitioner_id').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    qualifications: text('qualifications').array().$type<ServiceCode[]>().notNull(),
    workingHours: jsonb('working_hours')
      .$type<Partial<Record<Weekday, WorkingInterval[]>>>()
      .notNull(),
    createdAt,
  },
  (table) => [index('practitioners_tenant_idx').on(table.tenantId)],
);

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Null while the patient is not linked to a Termino record. */
    terminoPatientId: text('termino_patient_id').unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthDate: date('birth_date').notNull(),
    phone: text('phone'),
    email: text('email'),
    createdAt,
  },
  (table) => [index('patients_tenant_idx').on(table.tenantId)],
);

export const prescriptions = pgTable(
  'prescriptions',
  {
    id: uuid('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    issuedOn: date('issued_on').notNull(),
    diagnosisGroup: text('diagnosis_group').notNull(),
    serviceCode: text('service_code').$type<ServiceCode>().notNull(),
    units: integer('units').notNull(),
    frequencyPerWeek: integer('frequency_per_week').notNull(),
    createdAt,
  },
  (table) => [index('prescriptions_tenant_patient_idx').on(table.tenantId, table.patientId)],
);

/** One row per ingested Termino export. Makes the ingest idempotent. */
export const terminoExports = pgTable(
  'termino_exports',
  {
    exportId: text('export_id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    exportedAt: timestamp('exported_at', { withTimezone: true }).notNull(),
    windowFrom: date('window_from').notNull(),
    windowTo: date('window_to').notNull(),
    appointmentCount: integer('appointment_count').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt,
  },
  (table) => [index('termino_exports_tenant_idx').on(table.tenantId)],
);

/**
 * Appointments as Termino reports them. The Termino id is the primary key, so a
 * later export upserts the same row: the latest export wins.
 */
export const appointments = pgTable(
  'appointments',
  {
    terminoAppointmentId: text('termino_appointment_id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminoLocationId: text('termino_location_id').notNull(),
    terminoPractitionerId: text('termino_practitioner_id').notNull(),
    serviceLabel: text('service_label').notNull(),
    /** Null when the Termino label maps to no known service code. */
    serviceCode: text('service_code').$type<ServiceCode>(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull(),
    status: text('status').$type<AppointmentStatus>().notNull(),
    /** The patient copy Termino keeps; it may not match our master data. */
    patient: jsonb('patient').$type<TerminoPatient>().notNull(),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    lastSeenExportId: text('last_seen_export_id')
      .notNull()
      .references(() => terminoExports.exportId),
    createdAt,
  },
  (table) => [
    index('appointments_tenant_starts_idx').on(table.tenantId, table.startsAt),
    index('appointments_practitioner_idx').on(table.tenantId, table.terminoPractitionerId),
  ],
);

export const absences = pgTable(
  'absences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    category: text('category').$type<AbsenceCategory>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    note: text('note'),
    createdAt,
  },
  (table) => [index('absences_tenant_idx').on(table.tenantId)],
);

/** One reschedule task per patient per absence. */
export const rescheduleTasks = pgTable(
  'reschedule_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    absenceId: uuid('absence_id')
      .notNull()
      .references(() => absences.id),
    terminoPatientId: text('termino_patient_id').notNull(),
    status: text('status').$type<RescheduleTaskStatus>().notNull().default('open'),
    contactAttempts: integer('contact_attempts').notNull().default(0),
    pinned: boolean('pinned').notNull().default(false),
    /** Who closed the task: the system or the front desk. */
    resolvedBy: text('resolved_by').$type<'system' | 'front_desk'>(),
    createdAt,
    updatedAt,
  },
  (table) => [index('reschedule_tasks_tenant_absence_idx').on(table.tenantId, table.absenceId)],
);

export const affectedAppointments = pgTable(
  'affected_appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => rescheduleTasks.id),
    terminoAppointmentId: text('termino_appointment_id')
      .notNull()
      .references(() => appointments.terminoAppointmentId),
    inProgress: boolean('in_progress').notNull().default(false),
    imminent: boolean('imminent').notNull().default(false),
    decision: jsonb('decision').$type<EngineDecision>().notNull(),
    warnings: jsonb('warnings').$type<PrescriptionWarning[]>().notNull(),
    duplicateSameDay: boolean('duplicate_same_day').notNull().default(false),
    resolution: text('resolution').$type<Resolution>(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt,
  },
  (table) => [index('affected_appointments_tenant_task_idx').on(table.tenantId, table.taskId)],
);

/** Payload of an intended Termino write. */
export type TerminoWritePayload =
  | { op: 'rebook'; terminoAppointmentId: string; startsAt: string; terminoPractitionerId: string; terminoLocationId: string }
  | { op: 'swap'; terminoAppointmentId: string; terminoPractitionerId: string }
  | { op: 'cancel'; terminoAppointmentId: string; reason: string }
  | { op: 'block_practitioner'; terminoPractitionerId: string; from: string; to: string };

/** Payload of an intended notification. */
export interface NotificationPayload {
  channel: 'sms' | 'email';
  to: string;
  subject?: string;
  body: string;
  terminoPatientId: string;
  /** Which template produced the text; jsonb, so this needs no migration. */
  template?: string;
  /** The affected appointment the message is about, when there is one. */
  terminoAppointmentId?: string;
}

export type OutboxPayload = TerminoWritePayload | NotificationPayload;

/**
 * One outbox for Termino writes and notifications (ADR-0001). Nothing leaves
 * the system without a row here.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').$type<'termino_write' | 'notification'>().notNull(),
    payload: jsonb('payload').$type<OutboxPayload>().notNull(),
    status: text('status')
      .$type<'pending' | 'delivered' | 'confirmed' | 'failed'>()
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt,
    updatedAt,
  },
  (table) => [index('outbox_tenant_status_idx').on(table.tenantId, table.status)],
);

export type DataIssueKind = 'unmatched_patient' | 'fuzzy_match' | 'unknown_practitioner';

/** A candidate master patient for a fuzzy match. */
export interface FuzzyMatchCandidate {
  patientId: string;
  matchedOn: Array<'birthDate' | 'phone' | 'email'>;
}

/** Records the ingest cannot reconcile. The front desk resolves them. */
export const dataIssues = pgTable(
  'data_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').$type<DataIssueKind>().notNull(),
    ref: jsonb('ref').$type<Record<string, unknown>>().notNull(),
    candidates: jsonb('candidates').$type<FuzzyMatchCandidate[]>().notNull().default([]),
    status: text('status').$type<'open' | 'resolved'>().notNull().default('open'),
    resolution: jsonb('resolution').$type<Record<string, unknown>>(),
    createdAt,
  },
  (table) => [index('data_issues_tenant_status_idx').on(table.tenantId, table.status)],
);

export const schema = {
  tenants,
  locations,
  practitioners,
  patients,
  prescriptions,
  terminoExports,
  appointments,
  absences,
  rescheduleTasks,
  affectedAppointments,
  outbox,
  dataIssues,
};
