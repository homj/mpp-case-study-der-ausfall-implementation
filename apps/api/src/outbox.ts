/**
 * The outbox drain (ADR-0001). Nothing reaches Termino or a patient without a
 * row here. `deliverPending` walks the pending rows in delivery order —
 * Termino writes first, so a rebooking message never leaves before the write it
 * announces — hands each to the fake adapter, and records the outcome.
 *
 * Retries with backoff and a circuit breaker are out of scope for the case
 * study; a failed row keeps its error and the UI offers "done manually".
 */
import {
  countTerminoExports,
  insertOutboxEntry,
  listPendingOutbox,
  markOutboxConfirmed,
  markOutboxDelivered,
  markOutboxFailed,
} from '@ausfall/db';
import type {
  Database,
  NotificationPayload,
  OutboxPayload,
  OutboxRow,
  TerminoWritePayload,
} from '@ausfall/db';
import type { Notifier } from './adapters/notifier.js';
import type { TerminoClient, TerminoWriteResult } from './adapters/termino-client.js';

export type OutboxKind = 'termino_write' | 'notification';

export interface DeliveryReport {
  delivered: number;
  failed: number;
}

export interface OutboxDeps {
  db: Database;
  tenantId: string;
  termino: TerminoClient;
  notifier: Notifier;
}

/** Records an intended write or message. It is not sent yet. */
export async function enqueue(
  deps: Pick<OutboxDeps, 'db' | 'tenantId'>,
  kind: OutboxKind,
  payload: OutboxPayload,
): Promise<OutboxRow> {
  return insertOutboxEntry(deps.db, deps.tenantId, { kind, payload });
}

function isTerminoWrite(row: OutboxRow): row is OutboxRow & { payload: TerminoWritePayload } {
  return row.kind === 'termino_write';
}

/** Delivers one row and returns what Termino answered, if it was a write. */
async function deliverOne(deps: OutboxDeps, row: OutboxRow): Promise<TerminoWriteResult | null> {
  const context = { idempotencyKey: row.id };
  if (isTerminoWrite(row)) {
    const payload = row.payload;
    switch (payload.op) {
      case 'block_practitioner':
        return deps.termino.blockPractitioner(payload, context);
      case 'rebook':
        return deps.termino.rebook(payload, context);
      case 'swap':
        return deps.termino.swap(payload, context);
      case 'cancel':
        return deps.termino.cancel(payload, context);
    }
  }
  await deps.notifier.send(row.payload as NotificationPayload);
  return null;
}

/**
 * Drains every pending row once and reports what happened. A delivered write
 * is not done: it waits for an export to confirm it (ADR-0001), so we record
 * how many exports we had seen and, for a rebooking, which local booking the
 * adapter created. A practitioner block is the exception — no export ever
 * reports bookable capacity, so it is confirmed the moment it is delivered.
 */
export async function deliverPending(deps: OutboxDeps): Promise<DeliveryReport> {
  const rows = await listPendingOutbox(deps.db, deps.tenantId);
  const exportCount = await countTerminoExports(deps.db, deps.tenantId);
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await deliverOne(deps, row);
      const patch: Record<string, unknown> = {};
      if (result?.terminoAppointmentId !== undefined) {
        patch.localAppointmentId = result.terminoAppointmentId;
      }
      if (isTerminoWrite(row)) {
        patch.deliveredAtExportCount = exportCount;
        patch.deliveredAt = new Date().toISOString();
      }
      if (isTerminoWrite(row) && row.payload.op === 'block_practitioner') {
        await markOutboxConfirmed(deps.db, row.id, {
          ...patch,
          confirmedAt: new Date().toISOString(),
          confirmedBy: 'delivery',
        });
      } else {
        await markOutboxDelivered(deps.db, row.id, patch);
      }
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markOutboxFailed(deps.db, row.id, message);
      failed += 1;
    }
  }
  return { delivered, failed };
}
