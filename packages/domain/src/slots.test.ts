import { describe, expect, it } from 'vitest';
import { findAffectedAppointments } from './affected.js';
import { findCandidateSlots, freeGaps } from './slots.js';
import {
  LOCATIONS,
  appointment,
  block,
  engineInput,
  practitioner,
  shift,
  terminoPatient,
} from './testing/fixtures.js';
import { berlinDateTime } from './time.js';

const MONDAY = '2026-09-07';

function hhmm(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

describe('freeGaps', () => {
  const prac = practitioner('prac_02', ['KG', 'MT'], {
    mo: [shift('08:00', '12:00', 'l1'), shift('12:40', '16:00', 'l1')],
  });

  it('returns the whole working intervals when nothing is booked', () => {
    const gaps = freeGaps(prac, MONDAY, [], LOCATIONS);
    expect(gaps.map((g) => `${hhmm(g.startsAt)}-${hhmm(g.endsAt)}`)).toEqual([
      '08:00-12:00',
      '12:40-16:00',
    ]);
    expect(gaps[0]?.terminoLocationId).toBe('loc_01');
    expect(gaps[0]?.terminoPractitionerId).toBe('prac_02');
  });

  it('subtracts the practitioner own bookings on that Berlin day', () => {
    const bookings = [
      block('prac_02', 'loc_01', MONDAY, '08:00', 80, 1), // 08:00-09:20
      block('prac_02', 'loc_01', MONDAY, '09:40', 140, 2), // 09:40-12:00
      block('prac_02', 'loc_01', MONDAY, '12:40', 200, 3), // 12:40-16:00
    ];
    const gaps = freeGaps(prac, MONDAY, bookings, LOCATIONS);
    expect(gaps.map((g) => `${hhmm(g.startsAt)}-${hhmm(g.endsAt)}`)).toEqual(['09:20-09:40']);
  });

  it('ignores bookings of other practitioners and other days', () => {
    const bookings = [
      block('prac_09', 'loc_01', MONDAY, '08:00', 240, 1),
      block('prac_02', 'loc_01', '2026-09-08', '08:00', 240, 2),
    ];
    const gaps = freeGaps(prac, MONDAY, bookings, LOCATIONS);
    expect(gaps).toHaveLength(2);
  });

  it('returns nothing on a weekday without working hours', () => {
    expect(freeGaps(prac, '2026-09-08', [], LOCATIONS)).toEqual([]);
  });

  it('skips working intervals whose location id is unknown', () => {
    const stray = practitioner('prac_09', ['KG'], { mo: [shift('08:00', '12:00', 'l-missing')] });
    expect(freeGaps(stray, MONDAY, [], LOCATIONS)).toEqual([]);
  });
});

describe('findCandidateSlots', () => {
  const absent = practitioner('prac_01', ['KG', 'MT', 'MLD45'], {
    mo: [shift('08:00', '12:00', 'l1')],
  });
  const colleague = practitioner('prac_02', ['KG', 'MT'], {
    mo: [shift('08:00', '12:00', 'l1'), shift('12:40', '16:00', 'l1')],
  });
  const kgOnly = practitioner('prac_06', ['KG'], { mo: [shift('08:00', '12:00', 'l2')] });

  const patient = terminoPatient('pat_01');
  const original = appointment({
    id: 'apt_1',
    day: MONDAY,
    at: '09:20',
    durationMin: 20,
    practitioner: 'prac_01',
    location: 'loc_01',
    serviceCode: 'KG',
    patient,
  });

  const colleagueBookings = [
    block('prac_02', 'loc_01', MONDAY, '08:00', 80, 1),
    block('prac_02', 'loc_01', MONDAY, '09:40', 140, 2),
    block('prac_02', 'loc_01', MONDAY, '12:40', 200, 3),
  ];

  function setup(extraPractitioners: ReturnType<typeof practitioner>[] = []) {
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent, colleague, ...extraPractitioners],
      appointments: [original, ...colleagueBookings],
    });
    const affected = findAffectedAppointments(input)[0]!;
    return { input, affected };
  }

  it('offers the free gap of a qualified colleague, trimmed to the appointment duration', () => {
    const { input, affected } = setup();
    const slots = findCandidateSlots(affected, input, { days: [MONDAY] });
    expect(slots).toHaveLength(1);
    expect(slots[0]?.terminoPractitionerId).toBe('prac_02');
    expect(`${hhmm(slots[0]!.startsAt)}-${hhmm(slots[0]!.endsAt)}`).toBe('09:20-09:40');
  });

  it('never offers the absent practitioner own slots', () => {
    const { input, affected } = setup();
    const slots = findCandidateSlots(affected, input, { days: [MONDAY] });
    expect(slots.every((s) => s.terminoPractitionerId !== 'prac_01')).toBe(true);
  });

  it('skips practitioners without the required qualification', () => {
    const mld = appointment({
      id: 'apt_mld',
      day: MONDAY,
      at: '09:20',
      durationMin: 40,
      practitioner: 'prac_01',
      location: 'loc_01',
      serviceCode: 'MLD45',
      patient,
    });
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent, colleague, kgOnly],
      appointments: [mld],
    });
    const affected = findAffectedAppointments(input)[0]!;
    expect(findCandidateSlots(affected, input, { days: [MONDAY] })).toEqual([]);
  });

  it('drops gaps shorter than the appointment duration', () => {
    const long = appointment({
      id: 'apt_long',
      day: MONDAY,
      at: '09:20',
      durationMin: 60,
      practitioner: 'prac_01',
      location: 'loc_01',
      serviceCode: 'KG',
      patient,
    });
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [long, ...colleagueBookings],
    });
    const affected = findAffectedAppointments(input)[0]!;
    expect(findCandidateSlots(affected, input, { days: [MONDAY] })).toEqual([]);
  });

  it('excludes slots that start before now', () => {
    const input = engineInput({
      now: new Date('2026-09-07T08:00:00Z'), // 10:00 Berlin, after the 09:20 gap
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [original, ...colleagueBookings],
    });
    const affected = findAffectedAppointments(input)[0]!;
    expect(findCandidateSlots(affected, input, { days: [MONDAY] })).toEqual([]);
  });

  it('offers the original wall-clock time when a longer gap covers it', () => {
    const free = practitioner('prac_07', ['KG'], { mo: [shift('08:00', '12:00', 'l1')] });
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent, free],
      appointments: [original],
    });
    const affected = findAffectedAppointments(input)[0]!;
    const slots = findCandidateSlots(affected, input, { days: [MONDAY] });
    const starts = slots.map((s) => hhmm(s.startsAt));
    expect(starts).toContain('08:00'); // gap start
    expect(starts).toContain('09:20'); // original start time
  });

  it('sorts same day first, then same location, then closest to the original start', () => {
    const sameDayOtherLocation = practitioner('prac_06', ['KG'], {
      mo: [shift('11:00', '12:00', 'l2')],
    });
    const nextDaySameLocation = practitioner('prac_07', ['KG'], {
      di: [shift('09:00', '09:20', 'l1')],
    });
    const sameDaySameLocationLate = practitioner('prac_08', ['KG'], {
      mo: [shift('15:00', '16:00', 'l1')],
    });
    const input = engineInput({
      absentPractitioner: absent,
      practitioners: [absent, colleague, sameDayOtherLocation, nextDaySameLocation, sameDaySameLocationLate],
      appointments: [original, ...colleagueBookings],
    });
    const affected = findAffectedAppointments(input)[0]!;
    const slots = findCandidateSlots(affected, input, { days: [MONDAY, '2026-09-08'] });
    expect(slots.map((s) => s.terminoPractitionerId)).toEqual([
      'prac_02', // same day, same location, 09:20 (exact)
      'prac_08', // same day, same location, 15:00
      'prac_06', // same day, other location
      'prac_07', // next day
    ]);
    expect(slots[0]?.startsAt.getTime()).toBe(berlinDateTime(MONDAY, '09:20').getTime());
  });
});
