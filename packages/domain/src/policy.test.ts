import { describe, expect, it } from 'vitest';
import { findAffectedAppointments } from './affected.js';
import { isAutoRebookable, isContactable } from './policy.js';
import { appointment, engineInput, practitioner, terminoPatient } from './testing/fixtures.js';
import { berlinDateTime } from './time.js';
import { DEFAULT_AUTO_REBOOK_POLICY, type AutoRebookPolicy, type Slot } from './types.js';

const MONDAY = '2026-09-07';
const absent = practitioner('prac_01', ['KG'], {});

function affectedFor(patient = terminoPatient('pat_01')) {
  const appt = appointment({
    id: 'apt_1',
    day: MONDAY,
    at: '09:20',
    durationMin: 20,
    practitioner: 'prac_01',
    location: 'loc_01',
    serviceCode: 'KG',
    patient,
  });
  const input = engineInput({
    absentPractitioner: absent,
    practitioners: [absent],
    appointments: [appt],
  });
  return { affected: findAffectedAppointments(input)[0]!, input };
}

function slot(day: string, at: string, terminoLocationId = 'loc_01'): Slot {
  return {
    terminoPractitionerId: 'prac_02',
    terminoLocationId,
    startsAt: berlinDateTime(day, at),
    endsAt: berlinDateTime(day, at),
  };
}

function withPolicy(policy: Partial<AutoRebookPolicy>): AutoRebookPolicy {
  return { ...DEFAULT_AUTO_REBOOK_POLICY, ...policy };
}

describe('isContactable', () => {
  it('needs a phone number or an email address', () => {
    expect(isContactable(terminoPatient('a'))).toBe(true);
    expect(isContactable(terminoPatient('b', { phone: null }))).toBe(true);
    expect(isContactable(terminoPatient('c', { email: null }))).toBe(true);
    expect(isContactable(terminoPatient('d', { phone: null, email: null }))).toBe(false);
  });
});

describe('isAutoRebookable', () => {
  it('accepts a same-day, same-location slot for a contactable patient', () => {
    const { affected, input } = affectedFor();
    expect(isAutoRebookable(affected, slot(MONDAY, '10:00'), input)).toBe(true);
  });

  it('rejects another location while requireSameLocation holds', () => {
    const { affected, input } = affectedFor();
    expect(isAutoRebookable(affected, slot(MONDAY, '10:00', 'loc_02'), input)).toBe(false);
  });

  it('allows another location once requireSameLocation is off', () => {
    const { affected, input } = affectedFor();
    const relaxed = { ...input, policy: withPolicy({ requireSameLocation: false }) };
    expect(isAutoRebookable(affected, slot(MONDAY, '10:00', 'loc_02'), relaxed)).toBe(true);
  });

  it('honours the day window in both directions', () => {
    const { affected, input } = affectedFor();
    expect(isAutoRebookable(affected, slot('2026-09-09', '10:00'), input)).toBe(true);
    expect(isAutoRebookable(affected, slot('2026-09-05', '10:00'), input)).toBe(true);
    expect(isAutoRebookable(affected, slot('2026-09-10', '10:00'), input)).toBe(false);
    expect(isAutoRebookable(affected, slot('2026-09-04', '10:00'), input)).toBe(false);
  });

  it('rejects a patient we cannot reach while requireContactable holds', () => {
    const { affected, input } = affectedFor(terminoPatient('pat_02', { phone: null, email: null }));
    expect(isAutoRebookable(affected, slot(MONDAY, '10:00'), input)).toBe(false);
  });
});
