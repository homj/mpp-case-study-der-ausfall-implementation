import { describe, expect, it } from 'vitest';
import { findAffectedAppointments } from './affected.js';
import { appointment, engineInput, practitioner, terminoPatient } from './testing/fixtures.js';

const DAY = '2026-09-07';
const absent = practitioner('prac_01', ['KG', 'MT', 'MLD45'], {});

function inputWith(appointments: ReturnType<typeof appointment>[], now = '2026-09-07T05:40:00Z') {
  return engineInput({
    now: new Date(now),
    absentPractitioner: absent,
    practitioners: [absent],
    appointments,
  });
}

function appt(
  id: string,
  at: string,
  overrides: Partial<Parameters<typeof appointment>[0]> = {},
): ReturnType<typeof appointment> {
  return appointment({
    id,
    day: DAY,
    at,
    durationMin: 20,
    practitioner: 'prac_01',
    location: 'loc_01',
    serviceCode: 'KG',
    patient: terminoPatient(`pat_${id}`),
    ...overrides,
  });
}

describe('findAffectedAppointments', () => {
  it('keeps only booked appointments of the absent practitioner that overlap the absence', () => {
    const overlapping = appt('a1', '09:00');
    const otherPractitioner = appt('a2', '09:00', { practitioner: 'prac_02' });
    const cancelled = appt('a3', '10:00', { status: 'cancelled' });
    const beforeAbsence = appt('a4', '05:00'); // ends 05:20 Berlin, absence starts 07:40 Berlin
    const afterAbsence = appointment({
      id: 'a5',
      day: '2026-09-08',
      at: '09:00',
      durationMin: 20,
      practitioner: 'prac_01',
      location: 'loc_01',
      serviceCode: 'KG',
      patient: terminoPatient('pat_a5'),
    });

    const result = findAffectedAppointments(
      inputWith([afterAbsence, cancelled, overlapping, otherPractitioner, beforeAbsence]),
    );

    expect(result.map((a) => a.appointment.terminoAppointmentId)).toEqual(['a1']);
  });

  it('sorts by start time', () => {
    const result = findAffectedAppointments(inputWith([appt('late', '11:00'), appt('early', '09:00')]));
    expect(result.map((a) => a.appointment.terminoAppointmentId)).toEqual(['early', 'late']);
  });

  it('flags an appointment running at the reference instant as in progress', () => {
    const running = appt('running', '07:30'); // 07:30-07:50 Berlin, now is 07:40 Berlin
    const [affected] = findAffectedAppointments(inputWith([running]));
    expect(affected?.inProgress).toBe(true);
    expect(affected?.imminent).toBe(false);
  });

  it('flags an appointment inside the imminent threshold, but not one beyond it', () => {
    // now = 07:40 Berlin, threshold 30 min -> 08:00 is imminent, 08:20 is not.
    const soon = appt('soon', '08:00');
    const later = appt('later', '08:20');
    const result = findAffectedAppointments(inputWith([soon, later]));
    expect(result[0]?.imminent).toBe(true);
    expect(result[1]?.imminent).toBe(false);
  });

  it('treats an already finished appointment inside the absence as imminent, not in progress', () => {
    // Absence starts 06:00 Berlin so this 06:30 appointment overlaps; now is 09:00 Berlin.
    const input = engineInput({
      now: new Date('2026-09-07T07:00:00Z'),
      absence: {
        id: 'abs_1',
        practitionerId: absent.id,
        category: 'sick',
        startsAt: new Date('2026-09-07T04:00:00Z'),
        endsAt: new Date('2026-09-07T22:00:00Z'),
        note: null,
      },
      absentPractitioner: absent,
      practitioners: [absent],
      appointments: [appt('past', '06:30')],
    });
    const [affected] = findAffectedAppointments(input);
    expect(affected?.inProgress).toBe(false);
    expect(affected?.imminent).toBe(true);
  });
});
