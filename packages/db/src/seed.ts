/**
 * Seeds master data from the case-study JSON files. The JSON keeps its German
 * field names (see the glossary in CONTEXT.md); this module is the only place
 * that translates them. Every write is an upsert, so the seed is idempotent.
 */
import { readFile } from 'node:fs/promises';
import type { ServiceCode, Weekday, WorkingInterval } from '@ausfall/domain';
import type { Database } from './client.js';
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from './client.js';
import { dataFile } from './paths.js';
import { locations, patients, practitioners, prescriptions, tenants } from './schema.js';

interface RawLocation {
  id: string;
  name: string;
  adresse: string;
  termino_location_id: string;
}

interface RawWorkingInterval {
  von: string;
  bis: string;
  praxis_id: string;
}

interface RawPractitioner {
  id: string;
  vorname: string;
  nachname: string;
  qualifikationen: ServiceCode[];
  termino_practitioner_id: string;
  arbeitszeiten: Partial<Record<Weekday, RawWorkingInterval[]>>;
}

interface RawPatient {
  id: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  telefon: string | null;
  email: string | null;
  termino_patient_id: string | null;
}

interface RawPrescription {
  id: string;
  patient_id: string;
  ausstellungsdatum: string;
  diagnosegruppe: string;
  heilmittel: ServiceCode;
  verordnungsmenge: number;
  frequenz_pro_woche: number;
}

async function readJson<T>(name: string): Promise<T> {
  const text = await readFile(dataFile(name), 'utf8');
  const parsed: T = JSON.parse(text);
  return parsed;
}

function toWorkingHours(
  raw: Partial<Record<Weekday, RawWorkingInterval[]>>,
): Partial<Record<Weekday, WorkingInterval[]>> {
  const result: Partial<Record<Weekday, WorkingInterval[]>> = {};
  for (const [day, intervals] of Object.entries(raw)) {
    if (intervals === undefined) continue;
    result[day as Weekday] = intervals.map((interval) => ({
      from: interval.von,
      to: interval.bis,
      locationId: interval.praxis_id,
    }));
  }
  return result;
}

export interface SeedResult {
  tenantId: string;
  locations: number;
  practitioners: number;
  patients: number;
  prescriptions: number;
}

export async function seed(db: Database, tenantId = DEFAULT_TENANT_ID): Promise<SeedResult> {
  await db
    .insert(tenants)
    .values({ id: tenantId, name: DEFAULT_TENANT_NAME })
    .onConflictDoUpdate({ target: tenants.id, set: { name: DEFAULT_TENANT_NAME } });

  const rawLocations = await readJson<RawLocation[]>('praxen.json');
  for (const row of rawLocations) {
    const values = {
      id: row.id,
      tenantId,
      terminoLocationId: row.termino_location_id,
      name: row.name,
      address: row.adresse,
    };
    await db
      .insert(locations)
      .values(values)
      .onConflictDoUpdate({ target: locations.id, set: values });
  }

  const rawPractitioners = await readJson<RawPractitioner[]>('therapeuten.json');
  for (const row of rawPractitioners) {
    const values = {
      id: row.id,
      tenantId,
      terminoPractitionerId: row.termino_practitioner_id,
      firstName: row.vorname,
      lastName: row.nachname,
      qualifications: row.qualifikationen,
      workingHours: toWorkingHours(row.arbeitszeiten),
    };
    await db
      .insert(practitioners)
      .values(values)
      .onConflictDoUpdate({ target: practitioners.id, set: values });
  }

  const rawPatients = await readJson<RawPatient[]>('patienten.json');
  const patientValues = rawPatients.map((row) => ({
    id: row.id,
    tenantId,
    terminoPatientId: row.termino_patient_id ?? null,
    firstName: row.vorname,
    lastName: row.nachname,
    birthDate: row.geburtsdatum,
    phone: row.telefon ?? null,
    email: row.email ?? null,
  }));
  for (const values of patientValues) {
    await db
      .insert(patients)
      .values(values)
      .onConflictDoUpdate({ target: patients.id, set: values });
  }

  const rawPrescriptions = await readJson<RawPrescription[]>('verordnungen.json');
  const knownPatientIds = new Set(patientValues.map((patient) => patient.id));
  let prescriptionCount = 0;
  for (const row of rawPrescriptions) {
    // Tolerate a prescription that points at an unknown patient: skip it rather
    // than fail the seed. The ingest reports data gaps; the seed stays silent
    // except for this log line.
    if (!knownPatientIds.has(row.patient_id)) {
      console.warn(`seed: prescription ${row.id} references unknown patient ${row.patient_id}`);
      continue;
    }
    const values = {
      id: row.id,
      tenantId,
      patientId: row.patient_id,
      issuedOn: row.ausstellungsdatum,
      diagnosisGroup: row.diagnosegruppe,
      serviceCode: row.heilmittel,
      units: row.verordnungsmenge,
      frequencyPerWeek: row.frequenz_pro_woche,
    };
    await db
      .insert(prescriptions)
      .values(values)
      .onConflictDoUpdate({ target: prescriptions.id, set: values });
    prescriptionCount += 1;
  }

  return {
    tenantId,
    locations: rawLocations.length,
    practitioners: rawPractitioners.length,
    patients: patientValues.length,
    prescriptions: prescriptionCount,
  };
}
