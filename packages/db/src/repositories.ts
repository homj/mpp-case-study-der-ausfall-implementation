/**
 * Typed repository functions. They map rows to the domain types in
 * `@ausfall/domain` and nothing more; no business rules live here.
 * Every function takes the tenant id and scopes its query by it (ADR-0003).
 */
import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type {
  Absence,
  AbsenceCategory,
  Appointment,
  AppointmentStatus,
  AutoRebookPolicy,
  EngineDecision,
  EngineInput,
  Location,
  Patient,
  PatientId,
  Practitioner,
  Prescription,
  PrescriptionWarning,
  RescheduleTaskStatus,
  Resolution,
  TerminoPatientId,
} from '@ausfall/domain';
import type { Database } from './client.js';
import type {
  DataIssueKind,
  FuzzyMatchCandidate,
  OutboxPayload,
  TerminoWritePayload,
} from './schema.js';
import {
  absences,
  affectedAppointments,
  appointments,
  dataIssues,
  locations,
  outbox,
  patients,
  practitioners,
  prescriptions,
  rescheduleTasks,
  terminoExports,
} from './schema.js';

type PractitionerRow = typeof practitioners.$inferSelect;
type LocationRow = typeof locations.$inferSelect;
type PatientRow = typeof patients.$inferSelect;
type PrescriptionRow = typeof prescriptions.$inferSelect;
type AppointmentRow = typeof appointments.$inferSelect;
type AbsenceRow = typeof absences.$inferSelect;

function toPractitioner(row: PractitionerRow): Practitioner {
  return {
    id: row.id,
    terminoPractitionerId: row.terminoPractitionerId,
    firstName: row.firstName,
    lastName: row.lastName,
    qualifications: row.qualifications,
    workingHours: row.workingHours,
  };
}

function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    terminoLocationId: row.terminoLocationId,
    name: row.name,
    address: row.address,
  };
}

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    terminoPatientId: row.terminoPatientId,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    phone: row.phone,
    email: row.email,
  };
}

function toPrescription(row: PrescriptionRow): Prescription {
  return {
    id: row.id,
    patientId: row.patientId,
    issuedOn: row.issuedOn,
    diagnosisGroup: row.diagnosisGroup,
    serviceCode: row.serviceCode,
    units: row.units,
    frequencyPerWeek: row.frequencyPerWeek,
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    terminoAppointmentId: row.terminoAppointmentId,
    terminoLocationId: row.terminoLocationId,
    terminoPractitionerId: row.terminoPractitionerId,
    serviceLabel: row.serviceLabel,
    serviceCode: row.serviceCode ?? null,
    startsAt: row.startsAt,
    durationMin: row.durationMin,
    status: row.status,
    patient: row.patient,
    bookedAt: row.bookedAt,
    updatedAt: row.updatedAt,
  };
}

function toAbsence(row: AbsenceRow): Absence {
  return {
    id: row.id,
    practitionerId: row.practitionerId,
    category: row.category,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    note: row.note,
  };
}

export async function listPractitioners(db: Database, tenantId: string): Promise<Practitioner[]> {
  const rows = await db.select().from(practitioners).where(eq(practitioners.tenantId, tenantId));
  return rows.map(toPractitioner);
}

export async function listLocations(db: Database, tenantId: string): Promise<Location[]> {
  const rows = await db.select().from(locations).where(eq(locations.tenantId, tenantId));
  return rows.map(toLocation);
}

/** Every appointment we hold for the tenant; the exports already limit the window. */
export async function listAppointments(db: Database, tenantId: string): Promise<Appointment[]> {
  const rows = await db.select().from(appointments).where(eq(appointments.tenantId, tenantId));
  return rows.map(toAppointment);
}

export async function listPatients(db: Database, tenantId: string): Promise<Patient[]> {
  const rows = await db.select().from(patients).where(eq(patients.tenantId, tenantId));
  return rows.map(toPatient);
}

export async function listPrescriptions(db: Database, tenantId: string): Promise<Prescription[]> {
  const rows = await db.select().from(prescriptions).where(eq(prescriptions.tenantId, tenantId));
  return rows.map(toPrescription);
}

export interface LoadEngineInputOptions {
  absence: Absence;
  now: Date;
  policy: AutoRebookPolicy;
}

/**
 * Builds everything the domain engine needs for one absence.
 * `options.absence.practitionerId` is our own practitioner id, not the Termino one.
 */
export async function loadEngineInput(
  db: Database,
  tenantId: string,
  options: LoadEngineInputOptions,
): Promise<EngineInput> {
  const [allPractitioners, allLocations, allAppointments, allPatients, allPrescriptions] =
    await Promise.all([
      listPractitioners(db, tenantId),
      listLocations(db, tenantId),
      listAppointments(db, tenantId),
      listPatients(db, tenantId),
      listPrescriptions(db, tenantId),
    ]);

  const absentPractitioner = allPractitioners.find(
    (practitioner) => practitioner.id === options.absence.practitionerId,
  );
  if (absentPractitioner === undefined) {
    throw new Error(`Unknown practitioner ${options.absence.practitionerId} for tenant ${tenantId}`);
  }

  const patientsByTerminoId = new Map<TerminoPatientId, Patient>();
  for (const patient of allPatients) {
    if (patient.terminoPatientId !== null) {
      patientsByTerminoId.set(patient.terminoPatientId, patient);
    }
  }

  const prescriptionsByPatientId = new Map<PatientId, Prescription[]>();
  for (const prescription of allPrescriptions) {
    const list = prescriptionsByPatientId.get(prescription.patientId) ?? [];
    list.push(prescription);
    prescriptionsByPatientId.set(prescription.patientId, list);
  }

  return {
    now: options.now,
    absence: options.absence,
    absentPractitioner,
    practitioners: allPractitioners,
    locations: allLocations,
    appointments: allAppointments,
    patientsByTerminoId,
    prescriptionsByPatientId,
    policy: options.policy,
  };
}

export interface NewAbsence {
  practitionerId: string;
  category: AbsenceCategory;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
}

export async function insertAbsence(
  db: Database,
  tenantId: string,
  input: NewAbsence,
): Promise<Absence> {
  const [row] = await db
    .insert(absences)
    .values({ tenantId, ...input })
    .returning();
  if (row === undefined) throw new Error('Insert of absence returned no row');
  return toAbsence(row);
}

export async function getAbsence(
  db: Database,
  tenantId: string,
  absenceId: string,
): Promise<Absence | null> {
  const rows = await db
    .select()
    .from(absences)
    .where(and(eq(absences.tenantId, tenantId), eq(absences.id, absenceId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toAbsence(row);
}

export type RescheduleTaskRow = typeof rescheduleTasks.$inferSelect;

export async function insertRescheduleTask(
  db: Database,
  tenantId: string,
  input: {
    absenceId: string;
    terminoPatientId: string;
    status?: RescheduleTaskStatus;
    resolvedBy?: 'system' | 'front_desk' | null;
  },
): Promise<RescheduleTaskRow> {
  const [row] = await db
    .insert(rescheduleTasks)
    .values({ tenantId, ...input })
    .returning();
  if (row === undefined) throw new Error('Insert of reschedule task returned no row');
  return row;
}

export async function listRescheduleTasks(
  db: Database,
  tenantId: string,
  absenceId: string,
): Promise<RescheduleTaskRow[]> {
  return db
    .select()
    .from(rescheduleTasks)
    .where(and(eq(rescheduleTasks.tenantId, tenantId), eq(rescheduleTasks.absenceId, absenceId)));
}

export type AffectedAppointmentRow = typeof affectedAppointments.$inferSelect;

export async function insertAffectedAppointment(
  db: Database,
  tenantId: string,
  input: {
    taskId: string;
    terminoAppointmentId: string;
    inProgress: boolean;
    imminent: boolean;
    decision: EngineDecision;
    warnings: PrescriptionWarning[];
    duplicateSameDay: boolean;
    resolution?: Resolution | null;
  },
): Promise<AffectedAppointmentRow> {
  const [row] = await db
    .insert(affectedAppointments)
    .values({ tenantId, ...input, resolution: input.resolution ?? null })
    .returning();
  if (row === undefined) throw new Error('Insert of affected appointment returned no row');
  return row;
}

export async function listAffectedAppointments(
  db: Database,
  tenantId: string,
  taskId: string,
): Promise<AffectedAppointmentRow[]> {
  return db
    .select()
    .from(affectedAppointments)
    .where(
      and(eq(affectedAppointments.tenantId, tenantId), eq(affectedAppointments.taskId, taskId)),
    );
}

export type OutboxRow = typeof outbox.$inferSelect;

/** Records an intended Termino write or notification. Nothing is sent from here. */
export async function insertOutboxEntry(
  db: Database,
  tenantId: string,
  input: { kind: 'termino_write' | 'notification'; payload: OutboxPayload },
): Promise<OutboxRow> {
  const [row] = await db
    .insert(outbox)
    .values({ tenantId, kind: input.kind, payload: input.payload })
    .returning();
  if (row === undefined) throw new Error('Insert of outbox entry returned no row');
  return row;
}

export async function listOutbox(db: Database, tenantId: string): Promise<OutboxRow[]> {
  return db.select().from(outbox).where(eq(outbox.tenantId, tenantId));
}

export type DataIssueRow = typeof dataIssues.$inferSelect;

export async function insertDataIssue(
  db: Database,
  tenantId: string,
  input: {
    kind: DataIssueKind;
    ref: Record<string, unknown>;
    candidates?: FuzzyMatchCandidate[];
  },
): Promise<DataIssueRow> {
  const [row] = await db
    .insert(dataIssues)
    .values({ tenantId, kind: input.kind, ref: input.ref, candidates: input.candidates ?? [] })
    .returning();
  if (row === undefined) throw new Error('Insert of data issue returned no row');
  return row;
}

export async function listDataIssues(db: Database, tenantId: string): Promise<DataIssueRow[]> {
  return db.select().from(dataIssues).where(eq(dataIssues.tenantId, tenantId));
}

export interface RowCounts {
  locations: number;
  practitioners: number;
  patients: number;
  prescriptions: number;
  appointments: number;
  terminoExports: number;
  absences: number;
  rescheduleTasks: number;
  outbox: number;
  dataIssues: number;
}

/** Row counts per table for the health endpoint, scoped to one tenant. */
export async function countAll(db: Database, tenantId: string): Promise<RowCounts> {
  const [
    locationRows,
    practitionerRows,
    patientRows,
    prescriptionRows,
    appointmentRows,
    exportRows,
    absenceRows,
    taskRows,
    outboxRows,
    issueRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(locations).where(eq(locations.tenantId, tenantId)),
    db.select({ value: count() }).from(practitioners).where(eq(practitioners.tenantId, tenantId)),
    db.select({ value: count() }).from(patients).where(eq(patients.tenantId, tenantId)),
    db.select({ value: count() }).from(prescriptions).where(eq(prescriptions.tenantId, tenantId)),
    db.select({ value: count() }).from(appointments).where(eq(appointments.tenantId, tenantId)),
    db.select({ value: count() }).from(terminoExports).where(eq(terminoExports.tenantId, tenantId)),
    db.select({ value: count() }).from(absences).where(eq(absences.tenantId, tenantId)),
    db.select({ value: count() }).from(rescheduleTasks).where(eq(rescheduleTasks.tenantId, tenantId)),
    db.select({ value: count() }).from(outbox).where(eq(outbox.tenantId, tenantId)),
    db.select({ value: count() }).from(dataIssues).where(eq(dataIssues.tenantId, tenantId)),
  ]);

  return {
    locations: locationRows[0]?.value ?? 0,
    practitioners: practitionerRows[0]?.value ?? 0,
    patients: patientRows[0]?.value ?? 0,
    prescriptions: prescriptionRows[0]?.value ?? 0,
    appointments: appointmentRows[0]?.value ?? 0,
    terminoExports: exportRows[0]?.value ?? 0,
    absences: absenceRows[0]?.value ?? 0,
    rescheduleTasks: taskRows[0]?.value ?? 0,
    outbox: outboxRows[0]?.value ?? 0,
    dataIssues: issueRows[0]?.value ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Slice 2 helpers: single-row reads and updates the API use cases need.
// ---------------------------------------------------------------------------

export type AppointmentRowType = typeof appointments.$inferSelect;

export async function getPractitionerById(
  db: Database,
  tenantId: string,
  practitionerId: string,
): Promise<Practitioner | null> {
  const rows = await db
    .select()
    .from(practitioners)
    .where(and(eq(practitioners.tenantId, tenantId), eq(practitioners.id, practitionerId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toPractitioner(row);
}

export async function listAbsences(db: Database, tenantId: string): Promise<Absence[]> {
  const rows = await db
    .select()
    .from(absences)
    .where(eq(absences.tenantId, tenantId))
    .orderBy(desc(absences.createdAt));
  return rows.map(toAbsence);
}

/** The raw appointment row, including the bookkeeping columns the domain type drops. */
export async function getAppointmentRow(
  db: Database,
  tenantId: string,
  terminoAppointmentId: string,
): Promise<AppointmentRowType | null> {
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.terminoAppointmentId, terminoAppointmentId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getAppointmentById(
  db: Database,
  tenantId: string,
  terminoAppointmentId: string,
): Promise<Appointment | null> {
  const row = await getAppointmentRow(db, tenantId, terminoAppointmentId);
  return row === null ? null : toAppointment(row);
}

/**
 * Applies a Termino write to our own copy of the appointment (optimistic
 * update, ADR-0001). The next export confirms or contradicts it.
 */
export async function updateAppointmentFields(
  db: Database,
  tenantId: string,
  terminoAppointmentId: string,
  patch: Partial<{
    status: AppointmentStatus;
    startsAt: Date;
    terminoPractitionerId: string;
    terminoLocationId: string;
    updatedAt: Date;
  }>,
): Promise<void> {
  await db
    .update(appointments)
    .set(patch)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.terminoAppointmentId, terminoAppointmentId),
      ),
    );
}

/** Inserts an appointment our own rebook created; Termino has not exported it yet. */
export async function insertLocalAppointment(
  db: Database,
  tenantId: string,
  values: typeof appointments.$inferInsert,
): Promise<AppointmentRowType> {
  const [row] = await db
    .insert(appointments)
    .values({ ...values, tenantId })
    .returning();
  if (row === undefined) throw new Error('Insert of local appointment returned no row');
  return row;
}

/**
 * Pending outbox rows in delivery order. Termino writes go first, so a
 * rebooking message never leaves before the write it announces (ADR-0001).
 */
export async function listPendingOutbox(db: Database, tenantId: string): Promise<OutboxRow[]> {
  return db
    .select()
    .from(outbox)
    .where(and(eq(outbox.tenantId, tenantId), eq(outbox.status, 'pending')))
    .orderBy(sql`case when ${outbox.kind} = 'termino_write' then 0 else 1 end`, outbox.createdAt);
}

/**
 * Termino writes that are on their way: applied to our own rows already, not
 * yet confirmed by an export (ADR-0001). The ingest must not overwrite what
 * they changed, and the reconciliation looks for their evidence.
 */
export async function listUnconfirmedTerminoWrites(
  db: Database,
  tenantId: string,
): Promise<OutboxRow[]> {
  return db
    .select()
    .from(outbox)
    .where(
      and(
        eq(outbox.tenantId, tenantId),
        eq(outbox.kind, 'termino_write'),
        inArray(outbox.status, ['pending', 'delivered']),
      ),
    )
    .orderBy(outbox.createdAt);
}

/** The appointment ids those writes touch. A practitioner block names none. */
export function protectedAppointmentIdsOf(rows: OutboxRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const payload = row.payload as TerminoWritePayload;
    if ('terminoAppointmentId' in payload) ids.add(payload.terminoAppointmentId);
  }
  return ids;
}

/** Ids of appointments a local write owns until an export confirms it. */
export async function listProtectedAppointmentIds(
  db: Database,
  tenantId: string,
): Promise<Set<string>> {
  return protectedAppointmentIdsOf(await listUnconfirmedTerminoWrites(db, tenantId));
}

/** How many exports we have ingested. Used to age unconfirmed writes. */
export async function countTerminoExports(db: Database, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(terminoExports)
    .where(eq(terminoExports.tenantId, tenantId));
  return row?.value ?? 0;
}

/**
 * Merges extra fields into an outbox payload. The payload is jsonb, so facts
 * we learn later (the id Termino minted, when a write was confirmed) need no
 * migration.
 */
function mergePayload(patch: Record<string, unknown>) {
  return sql`${outbox.payload} || ${JSON.stringify(patch)}::jsonb`;
}

export async function markOutboxDelivered(
  db: Database,
  id: string,
  payloadPatch: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(outbox)
    .set({
      status: 'delivered',
      attempts: sql`${outbox.attempts} + 1`,
      lastError: null,
      updatedAt: new Date(),
      ...(Object.keys(payloadPatch).length > 0 ? { payload: mergePayload(payloadPatch) } : {}),
    })
    .where(eq(outbox.id, id));
}

/** The export showed the write, or no export ever can (a practitioner block). */
export async function markOutboxConfirmed(
  db: Database,
  id: string,
  payloadPatch: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(outbox)
    .set({
      status: 'confirmed',
      updatedAt: new Date(),
      ...(Object.keys(payloadPatch).length > 0 ? { payload: mergePayload(payloadPatch) } : {}),
    })
    .where(eq(outbox.id, id));
}

/** Records what we learned about a write without changing its status. */
export async function patchOutboxPayload(
  db: Database,
  id: string,
  payloadPatch: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(payloadPatch).length === 0) return;
  await db
    .update(outbox)
    .set({ payload: mergePayload(payloadPatch), updatedAt: new Date() })
    .where(eq(outbox.id, id));
}

/**
 * Drops a locally created booking once the export carries the real one, so the
 * patient is not listed twice (ADR-0001).
 */
export async function deleteAppointmentRow(
  db: Database,
  tenantId: string,
  terminoAppointmentId: string,
): Promise<void> {
  await db
    .delete(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.terminoAppointmentId, terminoAppointmentId),
      ),
    );
}

export async function markOutboxFailed(db: Database, id: string, error: string): Promise<void> {
  await db
    .update(outbox)
    .set({ status: 'failed', attempts: sql`${outbox.attempts} + 1`, lastError: error, updatedAt: new Date() })
    .where(eq(outbox.id, id));
}

export async function getRescheduleTask(
  db: Database,
  tenantId: string,
  taskId: string,
): Promise<RescheduleTaskRow | null> {
  const rows = await db
    .select()
    .from(rescheduleTasks)
    .where(and(eq(rescheduleTasks.tenantId, tenantId), eq(rescheduleTasks.id, taskId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateRescheduleTask(
  db: Database,
  tenantId: string,
  taskId: string,
  patch: Partial<{
    status: RescheduleTaskStatus;
    contactAttempts: number;
    resolvedBy: 'system' | 'front_desk' | null;
    pinned: boolean;
  }>,
): Promise<RescheduleTaskRow | null> {
  const [row] = await db
    .update(rescheduleTasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(rescheduleTasks.tenantId, tenantId), eq(rescheduleTasks.id, taskId)))
    .returning();
  return row ?? null;
}

export async function getAffectedAppointment(
  db: Database,
  tenantId: string,
  affectedId: string,
): Promise<AffectedAppointmentRow | null> {
  const rows = await db
    .select()
    .from(affectedAppointments)
    .where(and(eq(affectedAppointments.tenantId, tenantId), eq(affectedAppointments.id, affectedId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAffectedAppointment(
  db: Database,
  tenantId: string,
  affectedId: string,
  patch: Partial<{ resolution: Resolution | null; resolvedAt: Date | null; decision: EngineDecision }>,
): Promise<AffectedAppointmentRow | null> {
  const [row] = await db
    .update(affectedAppointments)
    .set(patch)
    .where(and(eq(affectedAppointments.tenantId, tenantId), eq(affectedAppointments.id, affectedId)))
    .returning();
  return row ?? null;
}

/** Every affected appointment of one absence, with its task row. */
export async function listAffectedAppointmentsByAbsence(
  db: Database,
  tenantId: string,
  absenceId: string,
): Promise<Array<{ affected: AffectedAppointmentRow; task: RescheduleTaskRow }>> {
  const rows = await db
    .select({ affected: affectedAppointments, task: rescheduleTasks })
    .from(affectedAppointments)
    .innerJoin(rescheduleTasks, eq(affectedAppointments.taskId, rescheduleTasks.id))
    .where(and(eq(affectedAppointments.tenantId, tenantId), eq(rescheduleTasks.absenceId, absenceId)));
  return rows;
}

/** Affected appointments of every task that is still open, across all absences. */
export async function listUnresolvedAffectedAppointments(
  db: Database,
  tenantId: string,
): Promise<Array<{ affected: AffectedAppointmentRow; task: RescheduleTaskRow; absence: AbsenceRow }>> {
  return db
    .select({ affected: affectedAppointments, task: rescheduleTasks, absence: absences })
    .from(affectedAppointments)
    .innerJoin(rescheduleTasks, eq(affectedAppointments.taskId, rescheduleTasks.id))
    .innerJoin(absences, eq(rescheduleTasks.absenceId, absences.id))
    .where(
      and(
        eq(affectedAppointments.tenantId, tenantId),
        isNull(affectedAppointments.resolution),
        ne(rescheduleTasks.status, 'resolved'),
      ),
    );
}

export async function listOpenDataIssues(db: Database, tenantId: string): Promise<DataIssueRow[]> {
  return db
    .select()
    .from(dataIssues)
    .where(and(eq(dataIssues.tenantId, tenantId), eq(dataIssues.status, 'open')));
}
