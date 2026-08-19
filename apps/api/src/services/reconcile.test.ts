import { describe, expect, it } from 'vitest';
import { reconcileWrites } from './reconcile.js';
import type { ExportAppointment, UnconfirmedWrite } from './reconcile.js';

function exportRow(overrides: Partial<ExportAppointment> = {}): ExportAppointment {
  return {
    terminoAppointmentId: 'apt_0001',
    terminoPractitionerId: 'prac_01',
    terminoPatientId: 'pat_0001',
    startsAt: '2026-09-07T08:00:00Z',
    status: 'booked',
    ...overrides,
  };
}

function write(overrides: Partial<UnconfirmedWrite> = {}): UnconfirmedWrite {
  return {
    id: 'out_1',
    op: 'cancel',
    status: 'delivered',
    terminoAppointmentId: 'apt_0001',
    deliveredAtExportCount: 1,
    ...overrides,
  };
}

const exportCount = 2;

describe('reconcileWrites', () => {
  it('leaves a write unconfirmed while the export still shows the old state', () => {
    const result = reconcileWrites({
      writes: [write()],
      exportAppointments: [exportRow()],
      exportCount,
    });
    expect(result).toMatchObject({ confirmed: 0, unconfirmed: 1, stale: 0 });
    expect(result.outcomes[0]).toEqual({ id: 'out_1', confirmed: false });
  });

  it('confirms a cancel when the export row is cancelled', () => {
    const result = reconcileWrites({
      writes: [write({ op: 'cancel' })],
      exportAppointments: [exportRow({ status: 'cancelled' })],
      exportCount,
    });
    expect(result.confirmed).toBe(1);
    expect(result.outcomes[0]).toEqual({ id: 'out_1', confirmed: true });
  });

  it('confirms a swap when the export shows the new practitioner', () => {
    const swap = write({ op: 'swap', terminoPractitionerId: 'prac_02' });
    expect(
      reconcileWrites({
        writes: [swap],
        exportAppointments: [exportRow({ terminoPractitionerId: 'prac_02' })],
        exportCount,
      }).confirmed,
    ).toBe(1);
    expect(
      reconcileWrites({
        writes: [swap],
        exportAppointments: [exportRow({ terminoPractitionerId: 'prac_01' })],
        exportCount,
      }).confirmed,
    ).toBe(0);
  });

  const rebook = write({
    op: 'rebook',
    terminoPractitionerId: 'prac_02',
    startsAt: '2026-09-07T11:00:00Z',
    terminoPatientId: 'pat_0001',
    localAppointmentId: 'apt_local_abcd1234',
  });
  const original = exportRow({ status: 'cancelled' });
  const replacement = exportRow({
    terminoAppointmentId: 'apt_9999',
    terminoPractitionerId: 'prac_02',
    startsAt: '2026-09-07T11:00:00Z',
  });

  it('confirms a rebook only when the original is cancelled and the new booking is there', () => {
    const result = reconcileWrites({
      writes: [rebook],
      exportAppointments: [original, replacement],
      exportCount,
    });
    expect(result.confirmed).toBe(1);
    expect(result.outcomes[0]).toEqual({
      id: 'out_1',
      confirmed: true,
      confirmedAs: 'apt_9999',
      retireAppointmentId: 'apt_local_abcd1234',
    });
  });

  it('does not confirm a rebook on a cancelled original alone', () => {
    const result = reconcileWrites({
      writes: [rebook],
      exportAppointments: [original],
      exportCount,
    });
    expect(result).toMatchObject({ confirmed: 0, unconfirmed: 1 });
  });

  it('does not confirm a rebook while the original is still booked', () => {
    const result = reconcileWrites({
      writes: [rebook],
      exportAppointments: [exportRow(), replacement],
      exportCount,
    });
    expect(result.confirmed).toBe(0);
  });

  it('does not take another patient, practitioner, or slot for the replacement', () => {
    const wrongPatient = { ...replacement, terminoPatientId: 'pat_0002' };
    const wrongSlot = { ...replacement, startsAt: '2026-09-07T12:00:00Z' };
    const wrongPractitioner = { ...replacement, terminoPractitionerId: 'prac_03' };
    for (const candidate of [wrongPatient, wrongSlot, wrongPractitioner]) {
      expect(
        reconcileWrites({
          writes: [rebook],
          exportAppointments: [original, candidate],
          exportCount,
        }).confirmed,
      ).toBe(0);
    }
  });

  it('reads the new start as an instant, not as a string', () => {
    const result = reconcileWrites({
      writes: [rebook],
      exportAppointments: [original, { ...replacement, startsAt: '2026-09-07T13:00:00+02:00' }],
      exportCount,
    });
    expect(result.confirmed).toBe(1);
  });

  it('never confirms a practitioner block from an export', () => {
    const result = reconcileWrites({
      writes: [write({ op: 'block_practitioner', terminoAppointmentId: undefined })],
      exportAppointments: [exportRow()],
      exportCount,
    });
    expect(result).toMatchObject({ confirmed: 0, unconfirmed: 1 });
  });

  it('flags a delivered write that sat through two exports', () => {
    const result = reconcileWrites({
      writes: [write({ deliveredAtExportCount: 1 })],
      exportAppointments: [exportRow()],
      exportCount: 3,
    });
    expect(result.stale).toBe(1);
    expect(result.outcomes[0]).toEqual({ id: 'out_1', confirmed: false, staleAfterExports: 2 });
  });

  it('does not flag a write after a single export, nor one still pending', () => {
    expect(
      reconcileWrites({
        writes: [write({ deliveredAtExportCount: 1 })],
        exportAppointments: [exportRow()],
        exportCount: 2,
      }).stale,
    ).toBe(0);
    expect(
      reconcileWrites({
        writes: [write({ status: 'pending', deliveredAtExportCount: undefined })],
        exportAppointments: [exportRow()],
        exportCount: 9,
      }).stale,
    ).toBe(0);
  });

  it('counts a mixed batch', () => {
    const result = reconcileWrites({
      writes: [
        write({ id: 'out_1', op: 'cancel' }),
        { ...rebook, id: 'out_2' },
        write({ id: 'out_3', op: 'swap', terminoPractitionerId: 'prac_07' }),
      ],
      exportAppointments: [original, replacement],
      exportCount,
    });
    expect(result).toMatchObject({ confirmed: 2, unconfirmed: 1 });
  });
});
