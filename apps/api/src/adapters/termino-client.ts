/**
 * The one door to Termino (ADR-0001). Nothing outside this port may change a
 * booking. The case study runs `FakeTerminoClient`, which applies the write to
 * our own `appointments` table so the UI can show the optimistic result; a real
 * client is a drop-in replacement.
 */
import { randomUUID } from 'node:crypto';
import {
  getAppointmentRow,
  insertLocalAppointment,
  updateAppointmentFields,
} from '@ausfall/db';
import type { Database } from '@ausfall/db';

export interface BlockPractitionerCommand {
  terminoPractitionerId: string;
  from: string;
  to: string;
}

export interface RebookCommand {
  terminoAppointmentId: string;
  startsAt: string;
  terminoPractitionerId: string;
  terminoLocationId: string;
}

export interface SwapCommand {
  terminoAppointmentId: string;
  terminoPractitionerId: string;
}

export interface CancelCommand {
  terminoAppointmentId: string;
  reason: string;
}

/** Every call carries the outbox row id as its idempotency key (ADR-0001). */
export interface WriteContext {
  idempotencyKey: string;
}

export interface TerminoWriteResult {
  ok: true;
  /** Set when the write created a new booking in Termino. */
  terminoAppointmentId?: string;
}

export interface TerminoClient {
  blockPractitioner(command: BlockPractitionerCommand, context: WriteContext): Promise<TerminoWriteResult>;
  rebook(command: RebookCommand, context: WriteContext): Promise<TerminoWriteResult>;
  swap(command: SwapCommand, context: WriteContext): Promise<TerminoWriteResult>;
  cancel(command: CancelCommand, context: WriteContext): Promise<TerminoWriteResult>;
}

/** Ids of bookings this tool created; a real Termino would mint its own. */
function localAppointmentId(): string {
  return `apt_local_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

export class FakeTerminoClient implements TerminoClient {
  constructor(
    private readonly db: Database,
    private readonly tenantId: string,
  ) {}

  /**
   * A block stops new bookings inside Termino. We hold no bookable-capacity
   * table of our own, so there is nothing to apply locally.
   */
  async blockPractitioner(): Promise<TerminoWriteResult> {
    return { ok: true };
  }

  /** Cancels the original booking and creates the replacement. */
  async rebook(command: RebookCommand): Promise<TerminoWriteResult> {
    const original = await this.requireAppointment(command.terminoAppointmentId);
    const now = new Date();
    await updateAppointmentFields(this.db, this.tenantId, command.terminoAppointmentId, {
      status: 'cancelled',
      updatedAt: now,
    });
    const terminoAppointmentId = localAppointmentId();
    await insertLocalAppointment(this.db, this.tenantId, {
      terminoAppointmentId,
      tenantId: this.tenantId,
      terminoLocationId: command.terminoLocationId,
      terminoPractitionerId: command.terminoPractitionerId,
      serviceLabel: original.serviceLabel,
      serviceCode: original.serviceCode,
      startsAt: new Date(command.startsAt),
      durationMin: original.durationMin,
      status: 'booked',
      patient: original.patient,
      bookedAt: now,
      updatedAt: now,
      lastSeenExportId: original.lastSeenExportId,
    });
    return { ok: true, terminoAppointmentId };
  }

  /** Same slot, other practitioner. */
  async swap(command: SwapCommand): Promise<TerminoWriteResult> {
    await this.requireAppointment(command.terminoAppointmentId);
    await updateAppointmentFields(this.db, this.tenantId, command.terminoAppointmentId, {
      terminoPractitionerId: command.terminoPractitionerId,
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  async cancel(command: CancelCommand): Promise<TerminoWriteResult> {
    await this.requireAppointment(command.terminoAppointmentId);
    await updateAppointmentFields(this.db, this.tenantId, command.terminoAppointmentId, {
      status: 'cancelled',
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  private async requireAppointment(terminoAppointmentId: string) {
    const row = await getAppointmentRow(this.db, this.tenantId, terminoAppointmentId);
    if (row === null) {
      throw new Error(`Termino write refers to unknown appointment ${terminoAppointmentId}`);
    }
    return row;
  }
}
