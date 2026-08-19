import { describe, expect, it } from 'vitest';
import { decide } from './engine.js';
import {
  appointment,
  block,
  engineInput,
  masterPatient,
  practitioner,
  prescription,
  shift,
  terminoPatient,
} from './testing/fixtures.js';
import { berlinDateTime } from './time.js';
import { DEFAULT_AUTO_REBOOK_POLICY, type Appointment, type ServiceCode } from './types.js';

const MONDAY = '2026-09-07';
const NOW = new Date('2026-09-07T05:40:00Z'); // 07:40 Berlin

const absent = practitioner('prac_01', ['KG', 'MT', 'MLD45'], {
  mo: [shift('08:00', '12:00', 'l1'), shift('13:00', '17:00', 'l2')],
});

function absenceAllDay() {
  return {
    id: 'abs_1',
    practitionerId: absent.id,
    category: 'sick' as const,
    startsAt: NOW,
    endsAt: new Date('2026-09-07T22:00:00Z'),
    note: null,
  };
}

function annaAppointment(
  id: string,
  at: string,
  serviceCode: ServiceCode,
  durationMin: number,
  location: string,
  patient = terminoPatient(`pat_${id}`),
): Appointment {
  return appointment({
    id,
    day: MONDAY,
    at,
    durationMin,
    practitioner: 'prac_01',
    location,
    serviceCode,
    patient,
  });
}

describe('decide — Monday 2026-09-07, Anna Weber is out from 07:40', () => {
  // prac_02 works Mitte all day; his bookings leave exactly one 09:20-09:40 gap.
  const colleague = practitioner('prac_02', ['KG', 'MT'], {
    mo: [shift('08:00', '12:00', 'l1'), shift('12:40', '16:00', 'l1')],
  });
  const colleagueBookings = [
    block('prac_02', 'loc_01', MONDAY, '08:00', 80, 1),
    block('prac_02', 'loc_01', MONDAY, '09:40', 140, 2),
    block('prac_02', 'loc_01', MONDAY, '12:40', 200, 3),
  ];

  const running = annaAppointment('apt_running', '07:30', 'KG', 20, 'loc_01');
  const imminent = annaAppointment('apt_0800', '08:00', 'KG', 20, 'loc_01');
  const rebookable = annaAppointment('apt_0920', '09:20', 'KG', 20, 'loc_01');
  const lymphDrainage = annaAppointment('apt_1440', '14:40', 'MLD45', 40, 'loc_02');

  const input = engineInput({
    now: NOW,
    absence: absenceAllDay(),
    absentPractitioner: absent,
    practitioners: [absent, colleague],
    appointments: [lymphDrainage, imminent, rebookable, running, ...colleagueBookings],
    patients: [masterPatient('m_0920', 'pat_apt_0920')],
    prescriptions: [prescription('rx_0920', 'm_0920', 'KG')],
  });

  const decisions = decide(input);

  it('returns one decision per affected appointment, in start order', () => {
    expect(decisions.map((d) => d.affected.appointment.terminoAppointmentId)).toEqual([
      'apt_running',
      'apt_0800',
      'apt_0920',
      'apt_1440',
    ]);
  });

  it('hands the running treatment to the front desk', () => {
    expect(decisions[0]?.decision).toEqual({
      kind: 'front_desk',
      reason: 'in_progress',
      candidates: [],
      sameDayImpossible: false,
    });
  });

  it('hands the 08:00 patient to the front desk because no colleague is free at that time', () => {
    expect(decisions[1]?.decision).toMatchObject({
      kind: 'front_desk',
      reason: 'imminent_no_swap',
    });
  });

  it('auto-rebooks the 09:20 patient into the 09:20 gap of the colleague, same day', () => {
    const decision = decisions[2]?.decision;
    expect(decision?.kind).toBe('auto_rebook');
    if (decision?.kind !== 'auto_rebook') throw new Error('expected auto_rebook');
    expect(decision.todayCancelled).toBe(false);
    expect(decision.slot.terminoPractitionerId).toBe('prac_02');
    expect(decision.slot.terminoLocationId).toBe('loc_01');
    expect(decision.slot.startsAt.getTime()).toBe(berlinDateTime(MONDAY, '09:20').getTime());
    expect(decision.slot.endsAt.getTime()).toBe(berlinDateTime(MONDAY, '09:40').getTime());
  });

  it('admits that the MLD45 appointment cannot be covered at all', () => {
    expect(decisions[3]?.decision).toEqual({
      kind: 'front_desk',
      reason: 'no_slot',
      candidates: [],
      sameDayImpossible: true,
    });
  });

  it('marks nobody as a duplicate when every patient appears once', () => {
    expect(decisions.every((d) => d.duplicateSameDay === false)).toBe(true);
  });

  it('attaches prescription warnings', () => {
    expect(decisions[0]?.warnings).toEqual([{ code: 'no_prescription', detail: 'unmatched patient' }]);
    expect(decisions[2]?.warnings.map((w) => w.code)).toContain('below_frequency');
  });
});

describe('decide — slot competition and policy edges', () => {
  it('never hands the same slot to two appointments', () => {
    const colleague = practitioner('prac_02', ['KG'], { mo: [shift('11:00', '11:20', 'l1')] });
    const first = annaAppointment('apt_a', '10:00', 'KG', 20, 'loc_01');
    const second = annaAppointment('apt_b', '10:20', 'KG', 20, 'loc_01');
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [first, second],
    });

    const [a, b] = decide(input);
    expect(a?.decision.kind).toBe('auto_rebook');
    expect(b?.decision).toEqual({
      kind: 'front_desk',
      reason: 'no_slot',
      candidates: [],
      sameDayImpossible: true,
    });
  });

  it('offers a same-time swap for an imminent appointment when a colleague is free', () => {
    const colleague = practitioner('prac_02', ['KG'], { mo: [shift('08:00', '12:00', 'l1')] });
    const imminent = annaAppointment('apt_0800', '08:00', 'KG', 20, 'loc_01');
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [imminent],
    });

    const decision = decide(input)[0]?.decision;
    expect(decision?.kind).toBe('swap_proposal');
    if (decision?.kind !== 'swap_proposal') throw new Error('expected swap_proposal');
    expect(decision.slot.terminoPractitionerId).toBe('prac_02');
    expect(decision.slot.startsAt.getTime()).toBe(berlinDateTime(MONDAY, '08:00').getTime());
  });

  it('proposes instead of auto-rebooking when the only slot is at the other location', () => {
    const colleague = practitioner('prac_06', ['KG'], { mo: [shift('09:30', '11:00', 'l2')] });
    const appt = annaAppointment('apt_a', '10:00', 'KG', 20, 'loc_01');
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [appt],
    });

    const decision = decide(input)[0]?.decision;
    expect(decision?.kind).toBe('proposal');
    if (decision?.kind !== 'proposal') throw new Error('expected proposal');
    expect(decision.sameDayImpossible).toBe(true); // a cross-location slot is not same-day coverage
    expect(decision.candidates).toHaveLength(2); // gap start and the original time of day
  });

  it('downgrades an auto-rebook to a proposal when the patient has no phone and no email', () => {
    const colleague = practitioner('prac_02', ['KG'], { mo: [shift('10:00', '10:20', 'l1')] });
    const appt = annaAppointment(
      'apt_a',
      '10:00',
      'KG',
      20,
      'loc_01',
      terminoPatient('pat_silent', { phone: null, email: null }),
    );
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [appt],
      // Even with the contactability gate switched off, we never auto-rebook someone we cannot tell.
      policy: { ...DEFAULT_AUTO_REBOOK_POLICY, requireContactable: false },
    });

    expect(decide(input)[0]?.decision.kind).toBe('proposal');
  });

  it('names the missing contact data when there is no slot either', () => {
    const appt = annaAppointment(
      'apt_a',
      '10:00',
      'KG',
      20,
      'loc_01',
      terminoPatient('pat_silent', { phone: null, email: null }),
    );
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent],
      appointments: [appt],
    });

    expect(decide(input)[0]?.decision).toMatchObject({
      kind: 'front_desk',
      reason: 'not_contactable',
    });
  });

  it('sets todayCancelled when the only slot is on another day', () => {
    const colleague = practitioner('prac_02', ['KG'], { di: [shift('10:00', '10:20', 'l1')] });
    const appt = annaAppointment('apt_a', '10:00', 'KG', 20, 'loc_01');
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent, colleague],
      appointments: [appt],
    });

    const decision = decide(input)[0]?.decision;
    expect(decision?.kind).toBe('auto_rebook');
    if (decision?.kind !== 'auto_rebook') throw new Error('expected auto_rebook');
    expect(decision.todayCancelled).toBe(true);
  });

  it('flags a patient booked twice on the same Berlin day', () => {
    const twice = terminoPatient('pat_kowalski');
    const input = engineInput({
      now: NOW,
      absence: absenceAllDay(),
      absentPractitioner: absent,
      practitioners: [absent],
      appointments: [
        annaAppointment('apt_a', '10:00', 'KG', 20, 'loc_01', twice),
        annaAppointment('apt_b', '16:20', 'KG', 20, 'loc_02', twice),
      ],
    });

    expect(decide(input).map((d) => d.duplicateSameDay)).toEqual([true, true]);
  });
});
