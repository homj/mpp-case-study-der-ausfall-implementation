/**
 * Ingests one Termino export. The ingest is idempotent by `export_id`: a second
 * run with the same file changes nothing. Appointments are upserted by their
 * Termino id, so the newest export wins — except where a local write owns the
 * row (ADR-0001): the export knows nothing about what we just wrote, so it must
 * not flip a cancelled original back to `booked`. Those rows are skipped until
 * an export confirms the write.
 *
 * Bad foreign keys must never stop the import. Unknown practitioner ids and
 * patients we cannot match become data issues for the front desk.
 */
import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { serviceCodeFromLabel } from '@ausfall/domain';
import type { AppointmentStatus } from '@ausfall/domain';
import type { Database } from './client.js';
import { DEFAULT_TENANT_ID } from './client.js';
import { listProtectedAppointmentIds } from './repositories.js';
import type { FuzzyMatchCandidate } from './schema.js';
import { appointments, dataIssues, patients, practitioners, terminoExports } from './schema.js';

interface RawExportPatient {
  id: string;
  name: string;
  birth_date: string;
  phone: string | null;
  email: string | null;
}

interface RawExportAppointment {
  id: string;
  location_id: string;
  practitioner_id: string;
  service: string;
  starts_at: string;
  duration_min: number;
  status: AppointmentStatus;
  patient: RawExportPatient;
  booked_at: string;
  updated_at: string;
}

interface RawExport {
  tool: string;
  export_id: string;
  exported_at: string;
  window: { from: string; to: string };
  appointments: RawExportAppointment[];
}

export interface IngestResult {
  exportId: string;
  skipped: boolean;
  appointments: number;
  /** Export rows a still unconfirmed local write owns, so we left them alone. */
  protectedAppointments: number;
  unknownPractitioners: number;
  unmatchedPatients: number;
  fuzzyMatches: number;
}

/** The part of an export row the reconciliation needs to confirm a write. */
export interface ExportedAppointment {
  terminoAppointmentId: string;
  terminoPractitionerId: string;
  terminoPatientId: string;
  startsAt: string;
  status: AppointmentStatus;
}

/**
 * Reads an export without touching the database. The reconciliation compares
 * our unconfirmed writes against these rows, not against our own tables — our
 * tables already carry the optimistic result.
 */
export async function readExportAppointments(filePath: string): Promise<ExportedAppointment[]> {
  const raw: RawExport = JSON.parse(await readFile(filePath, 'utf8'));
  return raw.appointments.map((appointment) => ({
    terminoAppointmentId: appointment.id,
    terminoPractitionerId: appointment.practitioner_id,
    terminoPatientId: appointment.patient.id,
    startsAt: appointment.starts_at,
    status: appointment.status,
  }));
}

export interface IngestOptions {
  /**
   * Appointments a local write owns. They keep their local state — including
   * `last_seen_export_id` — until the reconciliation confirms the write.
   * Defaults to the targets of every pending or delivered Termino write.
   */
  protectedAppointmentIds?: Set<string>;
}

function normalisePhone(value: string | null): string | null {
  if (value === null) return null;
  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
}

function normaliseEmail(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

const CHUNK_SIZE = 500;

export async function ingestExport(
  db: Database,
  filePath: string,
  tenantId = DEFAULT_TENANT_ID,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const raw: RawExport = JSON.parse(await readFile(filePath, 'utf8'));

  const existing = await db
    .select({ exportId: terminoExports.exportId })
    .from(terminoExports)
    .where(eq(terminoExports.exportId, raw.export_id))
    .limit(1);
  if (existing.length > 0) {
    return {
      exportId: raw.export_id,
      skipped: true,
      appointments: 0,
      protectedAppointments: 0,
      unknownPractitioners: 0,
      unmatchedPatients: 0,
      fuzzyMatches: 0,
    };
  }

  const protectedIds =
    options.protectedAppointmentIds ?? (await listProtectedAppointmentIds(db, tenantId));

  await db.insert(terminoExports).values({
    exportId: raw.export_id,
    tenantId,
    exportedAt: new Date(raw.exported_at),
    windowFrom: raw.window.from,
    windowTo: raw.window.to,
    appointmentCount: raw.appointments.length,
  });

  const rows = raw.appointments
    .filter((appointment) => !protectedIds.has(appointment.id))
    .map((appointment) => ({
      terminoAppointmentId: appointment.id,
      tenantId,
      terminoLocationId: appointment.location_id,
      terminoPractitionerId: appointment.practitioner_id,
      serviceLabel: appointment.service,
      serviceCode: serviceCodeFromLabel(appointment.service),
      startsAt: new Date(appointment.starts_at),
      durationMin: appointment.duration_min,
      status: appointment.status,
      patient: {
        terminoPatientId: appointment.patient.id,
        name: appointment.patient.name,
        birthDate: appointment.patient.birth_date,
        phone: appointment.patient.phone ?? null,
        email: appointment.patient.email ?? null,
      },
      bookedAt: new Date(appointment.booked_at),
      updatedAt: new Date(appointment.updated_at),
      lastSeenExportId: raw.export_id,
    }));

  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await db
      .insert(appointments)
      .values(chunk)
      .onConflictDoUpdate({
        target: appointments.terminoAppointmentId,
        set: {
          tenantId: sql`excluded.tenant_id`,
          terminoLocationId: sql`excluded.termino_location_id`,
          terminoPractitionerId: sql`excluded.termino_practitioner_id`,
          serviceLabel: sql`excluded.service_label`,
          serviceCode: sql`excluded.service_code`,
          startsAt: sql`excluded.starts_at`,
          durationMin: sql`excluded.duration_min`,
          status: sql`excluded.status`,
          patient: sql`excluded.patient`,
          bookedAt: sql`excluded.booked_at`,
          updatedAt: sql`excluded.updated_at`,
          lastSeenExportId: sql`excluded.last_seen_export_id`,
        },
      });
  }

  const issues = await recordDataIssues(db, tenantId, raw);
  return {
    exportId: raw.export_id,
    skipped: false,
    appointments: rows.length,
    protectedAppointments: raw.appointments.length - rows.length,
    ...issues,
  };
}

async function recordDataIssues(
  db: Database,
  tenantId: string,
  raw: RawExport,
): Promise<{ unknownPractitioners: number; unmatchedPatients: number; fuzzyMatches: number }> {
  const knownPractitioners = await db
    .select({ terminoPractitionerId: practitioners.terminoPractitionerId })
    .from(practitioners)
    .where(eq(practitioners.tenantId, tenantId));
  const knownPractitionerIds = new Set(
    knownPractitioners.map((row) => row.terminoPractitionerId),
  );

  const masterPatients = await db
    .select({
      id: patients.id,
      terminoPatientId: patients.terminoPatientId,
      birthDate: patients.birthDate,
      phone: patients.phone,
      email: patients.email,
    })
    .from(patients)
    .where(eq(patients.tenantId, tenantId));
  const linkedTerminoPatientIds = new Set(
    masterPatients
      .map((row) => row.terminoPatientId)
      .filter((value): value is string => value !== null),
  );

  const existingIssues = await db
    .select({ kind: dataIssues.kind, ref: dataIssues.ref })
    .from(dataIssues)
    .where(eq(dataIssues.tenantId, tenantId));
  const seen = new Set(
    existingIssues.map((issue) => `${issue.kind}:${String(issue.ref.key ?? '')}`),
  );

  const unknownPractitionerAppointments = new Map<string, string[]>();
  const unmatchedPatients = new Map<string, RawExportPatient>();
  for (const appointment of raw.appointments) {
    if (!knownPractitionerIds.has(appointment.practitioner_id)) {
      const list = unknownPractitionerAppointments.get(appointment.practitioner_id) ?? [];
      list.push(appointment.id);
      unknownPractitionerAppointments.set(appointment.practitioner_id, list);
    }
    if (!linkedTerminoPatientIds.has(appointment.patient.id)) {
      unmatchedPatients.set(appointment.patient.id, appointment.patient);
    }
  }

  let unknownPractitionerCount = 0;
  for (const [terminoPractitionerId, appointmentIds] of unknownPractitionerAppointments) {
    const key = `unknown_practitioner:${terminoPractitionerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.insert(dataIssues).values({
      tenantId,
      kind: 'unknown_practitioner',
      ref: { key: terminoPractitionerId, terminoPractitionerId, appointmentIds },
      candidates: [],
    });
    unknownPractitionerCount += 1;
  }

  let unmatchedCount = 0;
  let fuzzyCount = 0;
  for (const [terminoPatientId, patient] of unmatchedPatients) {
    const phone = normalisePhone(patient.phone);
    const email = normaliseEmail(patient.email);
    const candidates: FuzzyMatchCandidate[] = [];
    for (const master of masterPatients) {
      if (master.birthDate !== patient.birth_date) continue;
      const matchedOn: FuzzyMatchCandidate['matchedOn'] = ['birthDate'];
      if (phone !== null && normalisePhone(master.phone) === phone) matchedOn.push('phone');
      if (email !== null && normaliseEmail(master.email) === email) matchedOn.push('email');
      if (matchedOn.length > 1) candidates.push({ patientId: master.id, matchedOn });
    }

    const kind = candidates.length > 0 ? 'fuzzy_match' : 'unmatched_patient';
    const key = `${kind}:${terminoPatientId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.insert(dataIssues).values({
      tenantId,
      kind,
      ref: {
        key: terminoPatientId,
        terminoPatientId,
        name: patient.name,
        birthDate: patient.birth_date,
        phone: patient.phone,
        email: patient.email,
      },
      candidates,
    });
    if (kind === 'fuzzy_match') fuzzyCount += 1;
    else unmatchedCount += 1;
  }

  return {
    unknownPractitioners: unknownPractitionerCount,
    unmatchedPatients: unmatchedCount,
    fuzzyMatches: fuzzyCount,
  };
}
