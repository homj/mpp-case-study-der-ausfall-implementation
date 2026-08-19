/**
 * The confirmation rule of ADR-0001 as one pure function. A Termino write is
 * applied to our own rows first (optimistically) and is only ever *confirmed*
 * by a later export that shows the change. Until then the ingest leaves those
 * rows alone, so this module decides — from export evidence alone — which
 * writes may move to `confirmed`, which locally created bookings the real ones
 * replace, and which writes have been waiting for suspiciously long.
 *
 * No database, no clock, no I/O: everything it needs is in its input.
 */

export type ExportStatus = 'booked' | 'cancelled';

/** One appointment as the export reports it. */
export interface ExportAppointment {
  terminoAppointmentId: string;
  terminoPractitionerId: string;
  terminoPatientId: string;
  startsAt: string;
  status: ExportStatus;
}

/** A Termino write that is `pending` or `delivered` but not yet confirmed. */
export interface UnconfirmedWrite {
  id: string;
  op: 'rebook' | 'swap' | 'cancel' | 'block_practitioner';
  status: 'pending' | 'delivered';
  /** The appointment the write targets. A practitioner block names none. */
  terminoAppointmentId?: string;
  /** rebook and swap: the practitioner the appointment moves to. */
  terminoPractitionerId?: string;
  /** rebook: the new start, as ISO. */
  startsAt?: string;
  /** rebook: the patient of the original appointment, from our own copy. */
  terminoPatientId?: string;
  /** rebook: the `apt_local_*` row the adapter created for us. */
  localAppointmentId?: string;
  /** Exports ingested at the moment the write was delivered. */
  deliveredAtExportCount?: number;
}

export interface WriteOutcome {
  id: string;
  confirmed: boolean;
  /** The real Termino id that now carries the rebooking. */
  confirmedAs?: string;
  /** Our locally created booking, superseded by `confirmedAs`. */
  retireAppointmentId?: string;
  /** Exports that passed while the write stayed unconfirmed, once it is too many. */
  staleAfterExports?: number;
}

export interface ReconcileWritesInput {
  writes: UnconfirmedWrite[];
  exportAppointments: ExportAppointment[];
  /** Exports ingested so far, the one just ingested included. */
  exportCount: number;
  /** Exports a delivered write may sit through before it counts as stale. */
  staleThreshold?: number;
}

export interface ReconcileWritesResult {
  outcomes: WriteOutcome[];
  confirmed: number;
  unconfirmed: number;
  stale: number;
}

/** Two exports without evidence is drift worth showing (ADR-0001). */
export const STALE_AFTER_EXPORTS = 2;

function sameInstant(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * The replacement booking a rebook produced: same patient, the new
 * practitioner, the new start, and booked. Termino minted its own id for it.
 */
function findReplacement(
  write: UnconfirmedWrite,
  rows: ExportAppointment[],
): ExportAppointment | undefined {
  return rows.find(
    (row) =>
      row.status === 'booked' &&
      row.terminoAppointmentId !== write.terminoAppointmentId &&
      row.terminoPatientId === write.terminoPatientId &&
      row.terminoPractitionerId === write.terminoPractitionerId &&
      sameInstant(row.startsAt, write.startsAt),
  );
}

function confirm(
  write: UnconfirmedWrite,
  byId: Map<string, ExportAppointment>,
  rows: ExportAppointment[],
): { confirmed: boolean; confirmedAs?: string; retireAppointmentId?: string } {
  const target =
    write.terminoAppointmentId === undefined ? undefined : byId.get(write.terminoAppointmentId);

  switch (write.op) {
    case 'cancel':
      return { confirmed: target?.status === 'cancelled' };
    case 'swap':
      return {
        confirmed:
          target !== undefined && target.terminoPractitionerId === write.terminoPractitionerId,
      };
    case 'rebook': {
      if (target?.status !== 'cancelled') return { confirmed: false };
      const replacement = findReplacement(write, rows);
      if (replacement === undefined) return { confirmed: false };
      return {
        confirmed: true,
        confirmedAs: replacement.terminoAppointmentId,
        retireAppointmentId: write.localAppointmentId,
      };
    }
    // A block changes bookable capacity, which no export reports. It is
    // confirmed when it is delivered, so one seen here is still on its way.
    case 'block_practitioner':
      return { confirmed: false };
  }
}

export function reconcileWrites(input: ReconcileWritesInput): ReconcileWritesResult {
  const threshold = input.staleThreshold ?? STALE_AFTER_EXPORTS;
  const byId = new Map(
    input.exportAppointments.map((row) => [row.terminoAppointmentId, row] as const),
  );

  const outcomes: WriteOutcome[] = [];
  let confirmed = 0;
  let unconfirmed = 0;
  let stale = 0;

  for (const write of input.writes) {
    const verdict = confirm(write, byId, input.exportAppointments);
    if (verdict.confirmed) {
      confirmed += 1;
      outcomes.push({
        id: write.id,
        confirmed: true,
        ...(verdict.confirmedAs === undefined ? {} : { confirmedAs: verdict.confirmedAs }),
        ...(verdict.retireAppointmentId === undefined
          ? {}
          : { retireAppointmentId: verdict.retireAppointmentId }),
      });
      continue;
    }

    unconfirmed += 1;
    const since =
      write.status === 'delivered' && write.deliveredAtExportCount !== undefined
        ? input.exportCount - write.deliveredAtExportCount
        : 0;
    if (since >= threshold) {
      stale += 1;
      outcomes.push({ id: write.id, confirmed: false, staleAfterExports: since });
      continue;
    }
    outcomes.push({ id: write.id, confirmed: false });
  }

  return { outcomes, confirmed, unconfirmed, stale };
}
