/**
 * The slice-2 use cases. The domain engine decides; this module persists the
 * decisions as reschedule tasks and outbox rows, then drains the outbox.
 * No business rule lives here that the domain package could own.
 */
import { isAbsolute, normalize, resolve } from 'node:path';
import {
  DEFAULT_AUTO_REBOOK_POLICY,
  decide,
  rankTasks,
} from '@ausfall/domain';
import type {
  Absence,
  AbsenceCategory,
  AffectedAppointmentDecision,
  Appointment,
  AutoRebookPolicy,
  EngineDecision,
  Location,
  Practitioner,
  Resolution,
  Slot,
  TerminoPatient,
} from '@ausfall/domain';
import {
  countTerminoExports,
  dataDir,
  deleteAppointmentRow,
  getAbsence,
  getAffectedAppointment,
  getPractitionerById,
  getRescheduleTask,
  ingestExport,
  insertAbsence,
  insertAffectedAppointment,
  insertRescheduleTask,
  listAbsences,
  listAffectedAppointments,
  listAffectedAppointmentsByAbsence,
  listAppointments,
  listLocations,
  loadEngineInput,
  listOpenDataIssues,
  listOutbox,
  listPractitioners,
  listRescheduleTasks,
  listUnconfirmedTerminoWrites,
  listUnresolvedAffectedAppointments,
  markOutboxConfirmed,
  patchOutboxPayload,
  protectedAppointmentIdsOf,
  readExportAppointments,
  updateAffectedAppointment,
  updateRescheduleTask,
} from '@ausfall/db';
import type {
  AffectedAppointmentRow,
  Database,
  DataIssueRow,
  NotificationPayload,
  OutboxRow,
  RescheduleTaskRow,
  TerminoWritePayload,
} from '@ausfall/db';
import type { Notifier } from '../adapters/notifier.js';
import type { TerminoClient } from '../adapters/termino-client.js';
import { deliverPending, enqueue } from '../outbox.js';
import { renderMessage } from '../messages.js';
import type { MessageTemplate } from '../messages.js';
import { reconcileWrites } from './reconcile.js';
import type { UnconfirmedWrite } from './reconcile.js';

/** The practice as it signs its messages. Real deployments read this per tenant. */
export const PRACTICE_NAME = 'meinphysio+';
export const FRONT_DESK_PHONE = '+49 30 555 0100';

export interface AbsenceServiceDeps {
  db: Database;
  tenantId: string;
  termino: TerminoClient;
  notifier: Notifier;
  now: () => Date;
  policy?: AutoRebookPolicy;
}

/** Raised when a path parameter names a record this tenant does not have. */
export class NotFoundError extends Error {}
/** Raised when the request is well formed but the record cannot take the action. */
export class ConflictError extends Error {}

function policyOf(deps: AbsenceServiceDeps): AutoRebookPolicy {
  return deps.policy ?? DEFAULT_AUTO_REBOOK_POLICY;
}

// --- jsonb round-trip -------------------------------------------------------
// A decision goes to Postgres as jsonb, so its `Date`s come back as ISO strings.

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string): string {
  return toDate(value).toISOString();
}

function reviveSlot(slot: Slot): Slot {
  return { ...slot, startsAt: toDate(slot.startsAt), endsAt: toDate(slot.endsAt) };
}

/** Turns a decision read from jsonb back into one with real `Date`s. */
export function reviveDecision(decision: EngineDecision): EngineDecision {
  switch (decision.kind) {
    case 'auto_rebook':
      return { ...decision, slot: reviveSlot(decision.slot) };
    case 'swap_proposal':
      return { ...decision, slot: reviveSlot(decision.slot) };
    default:
      return { ...decision, candidates: decision.candidates.map(reviveSlot) };
  }
}

interface SlotView {
  terminoPractitionerId: string;
  practitionerName: string;
  terminoLocationId: string;
  locationName: string;
  startsAt: string;
  endsAt: string;
}

interface NameLookup {
  practitionerName: (terminoPractitionerId: string) => string;
  location: (terminoLocationId: string) => { name: string; address: string };
}

function nameLookup(practitioners: Practitioner[], locations: Location[]): NameLookup {
  const byPractitioner = new Map(practitioners.map((p) => [p.terminoPractitionerId, p]));
  const byLocation = new Map(locations.map((l) => [l.terminoLocationId, l]));
  return {
    practitionerName: (id) => {
      const found = byPractitioner.get(id);
      return found === undefined ? id : `${found.firstName} ${found.lastName}`;
    },
    location: (id) => {
      const found = byLocation.get(id);
      return found === undefined ? { name: id, address: '' } : { name: found.name, address: found.address };
    },
  };
}

function toSlotView(slot: Slot, lookup: NameLookup): SlotView {
  return {
    terminoPractitionerId: slot.terminoPractitionerId,
    practitionerName: lookup.practitionerName(slot.terminoPractitionerId),
    terminoLocationId: slot.terminoLocationId,
    locationName: lookup.location(slot.terminoLocationId).name,
    startsAt: toIso(slot.startsAt),
    endsAt: toIso(slot.endsAt),
  };
}

/** The decision as the API reports it: names resolved, instants as ISO strings. */
function toDecisionView(decision: EngineDecision, lookup: NameLookup) {
  switch (decision.kind) {
    case 'auto_rebook':
      return {
        kind: decision.kind,
        slot: toSlotView(decision.slot, lookup),
        todayCancelled: decision.todayCancelled,
        candidates: [],
        sameDayImpossible: false,
        reason: null,
      };
    case 'swap_proposal':
      return {
        kind: decision.kind,
        slot: toSlotView(decision.slot, lookup),
        todayCancelled: false,
        candidates: [],
        sameDayImpossible: false,
        reason: null,
      };
    case 'proposal':
      return {
        kind: decision.kind,
        slot: null,
        todayCancelled: false,
        candidates: decision.candidates.map((slot) => toSlotView(slot, lookup)),
        sameDayImpossible: decision.sameDayImpossible,
        reason: null,
      };
    case 'front_desk':
      return {
        kind: decision.kind,
        slot: null,
        todayCancelled: false,
        candidates: decision.candidates.map((slot) => toSlotView(slot, lookup)),
        sameDayImpossible: decision.sameDayImpossible,
        reason: decision.reason,
      };
  }
}

// --- notifications ----------------------------------------------------------

interface NotifyInput {
  patient: TerminoPatient;
  template: MessageTemplate;
  originalStart: Date;
  terminoAppointmentId: string;
  newSlot?: { slot: Slot; lookup: NameLookup };
}

/** One message per channel we have. Both, when the patient gave both. */
async function enqueueNotifications(
  deps: AbsenceServiceDeps,
  input: NotifyInput,
): Promise<number> {
  const message = renderMessage(input.template, {
    patientName: input.patient.name,
    practiceName: PRACTICE_NAME,
    frontDeskPhone: FRONT_DESK_PHONE,
    originalStart: input.originalStart,
    newSlot:
      input.newSlot === undefined
        ? undefined
        : {
            startsAt: toDate(input.newSlot.slot.startsAt),
            practitionerName: input.newSlot.lookup.practitionerName(
              input.newSlot.slot.terminoPractitionerId,
            ),
            locationName: input.newSlot.lookup.location(input.newSlot.slot.terminoLocationId).name,
            locationAddress: input.newSlot.lookup.location(input.newSlot.slot.terminoLocationId)
              .address,
          },
  });

  const channels: Array<{ channel: 'sms' | 'email'; to: string }> = [];
  if (input.patient.phone) channels.push({ channel: 'sms', to: input.patient.phone });
  if (input.patient.email) channels.push({ channel: 'email', to: input.patient.email });

  for (const target of channels) {
    const payload: NotificationPayload = {
      channel: target.channel,
      to: target.to,
      subject: message.subject,
      body: message.body,
      terminoPatientId: input.patient.terminoPatientId,
      template: input.template,
      terminoAppointmentId: input.terminoAppointmentId,
    };
    await enqueue(deps, 'notification', payload);
  }
  return channels.length;
}

// --- create absence ---------------------------------------------------------

export interface CreateAbsenceInput {
  practitionerId: string;
  category: AbsenceCategory;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
}

export interface CreateAbsenceResult {
  absenceId: string;
  counts: {
    affectedAppointments: number;
    tasks: number;
    tasksResolvedBySystem: number;
    autoRebooks: number;
    swapProposals: number;
    proposals: number;
    frontDesk: number;
    terminoWrites: number;
    notifications: number;
  };
  delivery: { delivered: number; failed: number };
}

export async function createAbsence(
  deps: AbsenceServiceDeps,
  input: CreateAbsenceInput,
): Promise<CreateAbsenceResult> {
  const practitioner = await getPractitionerById(deps.db, deps.tenantId, input.practitionerId);
  if (practitioner === null) {
    throw new NotFoundError(`Unknown practitioner ${input.practitionerId}`);
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new ConflictError('The absence must end after it starts');
  }

  const absence = await insertAbsence(deps.db, deps.tenantId, input);

  // The practitioner is blocked in Termino as soon as the absence is recorded.
  const blockPayload: TerminoWritePayload = {
    op: 'block_practitioner',
    terminoPractitionerId: practitioner.terminoPractitionerId,
    from: absence.startsAt.toISOString(),
    to: absence.endsAt.toISOString(),
  };
  await enqueue(deps, 'termino_write', blockPayload);
  let terminoWrites = 1;
  let notifications = 0;

  const engineInput = await loadInput(deps, absence);
  const [practitioners, locations] = await Promise.all([
    listPractitioners(deps.db, deps.tenantId),
    listLocations(deps.db, deps.tenantId),
  ]);
  const lookup = nameLookup(practitioners, locations);

  const decisions = decide(engineInput);
  const counts = {
    affectedAppointments: decisions.length,
    tasks: 0,
    tasksResolvedBySystem: 0,
    autoRebooks: 0,
    swapProposals: 0,
    proposals: 0,
    frontDesk: 0,
    terminoWrites: 0,
    notifications: 0,
  };

  for (const [terminoPatientId, group] of groupByPatient(decisions)) {
    const written = await persistTask(deps, absence.id, terminoPatientId, group, lookup);
    counts.tasks += 1;
    if (written.resolvedBySystem) counts.tasksResolvedBySystem += 1;
    terminoWrites += written.terminoWrites;
    notifications += written.notifications;
    for (const decision of group) {
      if (decision.decision.kind === 'auto_rebook') counts.autoRebooks += 1;
      else if (decision.decision.kind === 'swap_proposal') counts.swapProposals += 1;
      else if (decision.decision.kind === 'proposal') counts.proposals += 1;
      else counts.frontDesk += 1;
    }
  }

  counts.terminoWrites = terminoWrites;
  counts.notifications = notifications;

  const delivery = await deliverPending(deps);
  return { absenceId: absence.id, counts, delivery };
}

function groupByPatient(
  decisions: AffectedAppointmentDecision[],
): Map<string, AffectedAppointmentDecision[]> {
  const grouped = new Map<string, AffectedAppointmentDecision[]>();
  for (const decision of decisions) {
    const key = decision.affected.appointment.patient.terminoPatientId;
    const list = grouped.get(key) ?? [];
    list.push(decision);
    grouped.set(key, list);
  }
  return grouped;
}

async function persistTask(
  deps: AbsenceServiceDeps,
  absenceId: string,
  terminoPatientId: string,
  group: AffectedAppointmentDecision[],
  lookup: NameLookup,
): Promise<{ resolvedBySystem: boolean; terminoWrites: number; notifications: number }> {
  // The system only closes a task when it handled every appointment on its own.
  const resolvedBySystem = group.every((entry) => entry.decision.kind === 'auto_rebook');
  const task = await insertRescheduleTask(deps.db, deps.tenantId, {
    absenceId,
    terminoPatientId,
    status: resolvedBySystem ? 'resolved' : 'open',
    resolvedBy: resolvedBySystem ? 'system' : null,
  });

  let terminoWrites = 0;
  let notifications = 0;

  for (const entry of group) {
    const appointment = entry.affected.appointment;
    const auto = entry.decision.kind === 'auto_rebook';
    await insertAffectedAppointment(deps.db, deps.tenantId, {
      taskId: task.id,
      terminoAppointmentId: appointment.terminoAppointmentId,
      inProgress: entry.affected.inProgress,
      imminent: entry.affected.imminent,
      decision: entry.decision,
      warnings: entry.warnings,
      duplicateSameDay: entry.duplicateSameDay,
      resolution: auto ? 'rebooked' : null,
    });

    if (entry.decision.kind === 'auto_rebook') {
      const slot = entry.decision.slot;
      const payload: TerminoWritePayload = {
        op: 'rebook',
        terminoAppointmentId: appointment.terminoAppointmentId,
        startsAt: toIso(slot.startsAt),
        terminoPractitionerId: slot.terminoPractitionerId,
        terminoLocationId: slot.terminoLocationId,
      };
      await enqueue(deps, 'termino_write', payload);
      terminoWrites += 1;
      notifications += await enqueueNotifications(deps, {
        patient: appointment.patient,
        template: 'rebooked',
        originalStart: appointment.startsAt,
        terminoAppointmentId: appointment.terminoAppointmentId,
        newSlot: { slot, lookup },
      });
      continue;
    }

    // Same-day coverage is provably impossible: tell the patient now, so nobody
    // travels for nothing. An in-progress treatment needs no such notice.
    const sameDayImpossible =
      'sameDayImpossible' in entry.decision && entry.decision.sameDayImpossible;
    if (sameDayImpossible && !entry.affected.inProgress) {
      notifications += await enqueueNotifications(deps, {
        patient: appointment.patient,
        template: 'cancelled_today',
        originalStart: appointment.startsAt,
        terminoAppointmentId: appointment.terminoAppointmentId,
      });
    }
  }

  return { resolvedBySystem, terminoWrites, notifications };
}

async function loadInput(deps: AbsenceServiceDeps, absence: Absence) {
  return loadEngineInput(deps.db, deps.tenantId, {
    absence,
    now: deps.now(),
    policy: policyOf(deps),
  });
}

// --- views ------------------------------------------------------------------

export async function listAbsenceSummaries(deps: AbsenceServiceDeps) {
  const [absences, practitioners] = await Promise.all([
    listAbsences(deps.db, deps.tenantId),
    listPractitioners(deps.db, deps.tenantId),
  ]);
  const byId = new Map(practitioners.map((p) => [p.id, p]));
  const summaries = [];
  for (const absence of absences) {
    const tasks = await listRescheduleTasks(deps.db, deps.tenantId, absence.id);
    const practitioner = byId.get(absence.practitionerId);
    summaries.push({
      id: absence.id,
      practitionerId: absence.practitionerId,
      practitionerName:
        practitioner === undefined
          ? absence.practitionerId
          : `${practitioner.firstName} ${practitioner.lastName}`,
      category: absence.category,
      startsAt: absence.startsAt.toISOString(),
      endsAt: absence.endsAt.toISOString(),
      note: absence.note,
      taskCount: tasks.length,
      openTaskCount: tasks.filter((task) => task.status !== 'resolved').length,
    });
  }
  return summaries;
}

function toOutboxView(row: OutboxRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    payload: row.payload as unknown as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDataIssueView(row: DataIssueRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    ref: row.ref,
    candidates: row.candidates,
  };
}

export async function getAbsenceView(deps: AbsenceServiceDeps, absenceId: string) {
  const absence = await getAbsence(deps.db, deps.tenantId, absenceId);
  if (absence === null) throw new NotFoundError(`Unknown absence ${absenceId}`);

  const [practitioners, locations, appointments, tasks, joined, outboxRows, issues] =
    await Promise.all([
      listPractitioners(deps.db, deps.tenantId),
      listLocations(deps.db, deps.tenantId),
      listAppointments(deps.db, deps.tenantId),
      listRescheduleTasks(deps.db, deps.tenantId, absenceId),
      listAffectedAppointmentsByAbsence(deps.db, deps.tenantId, absenceId),
      listOutbox(deps.db, deps.tenantId),
      listOpenDataIssues(deps.db, deps.tenantId),
    ]);

  const lookup = nameLookup(practitioners, locations);
  const appointmentById = new Map(appointments.map((a) => [a.terminoAppointmentId, a]));
  const absentPractitioner = practitioners.find((p) => p.id === absence.practitionerId);

  const affectedByTask = new Map<string, AffectedAppointmentRow[]>();
  for (const row of joined) {
    const list = affectedByTask.get(row.affected.taskId) ?? [];
    list.push(row.affected);
    affectedByTask.set(row.affected.taskId, list);
  }

  const taskViews = tasks.map((task) => {
    const rows = (affectedByTask.get(task.id) ?? []).sort(
      (a, b) =>
        startOf(appointmentById, a).getTime() - startOf(appointmentById, b).getTime(),
    );
    const items = rows.map((row) => toAffectedView(row, appointmentById, lookup));
    const open = items.filter((item) => item.resolution === null);
    const earliest = (open.length > 0 ? open : items)[0];
    const patient = rows[0] === undefined ? null : appointmentById.get(rows[0].terminoAppointmentId)?.patient ?? null;
    return {
      id: task.id,
      absenceId: task.absenceId,
      terminoPatientId: task.terminoPatientId,
      patientName: patient?.name ?? task.terminoPatientId,
      phone: patient?.phone ?? null,
      email: patient?.email ?? null,
      status: task.status,
      contactAttempts: task.contactAttempts,
      pinned: task.pinned,
      resolvedBy: task.resolvedBy,
      warningCount: items.reduce((total, item) => total + item.warnings.length, 0),
      earliestStartsAt: earliest === undefined ? absence.startsAt.toISOString() : earliest.startsAt,
      affectedAppointments: items,
    };
  });

  const ranked = rankTasks(
    taskViews.map((task) => ({
      ...task,
      earliestStartsAt: new Date(task.earliestStartsAt),
      phoneContactable: task.phone !== null && task.phone !== '',
    })),
  ).map((task) => ({ ...task, earliestStartsAt: task.earliestStartsAt.toISOString() }));

  // Outbox rows that belong to this absence: its patients' messages and the
  // Termino writes for its appointments (plus the practitioner block).
  const patientIds = new Set(tasks.map((task) => task.terminoPatientId));
  const appointmentIds = new Set(joined.map((row) => row.affected.terminoAppointmentId));
  const terminoPractitionerId = absentPractitioner?.terminoPractitionerId ?? '';
  const relevant = outboxRows.filter((row) => {
    const payload = row.payload as Record<string, unknown>;
    if (row.kind === 'notification') {
      return patientIds.has(String(payload.terminoPatientId));
    }
    if (payload.op === 'block_practitioner') {
      return payload.terminoPractitionerId === terminoPractitionerId;
    }
    return appointmentIds.has(String(payload.terminoAppointmentId));
  });

  return {
    absence: {
      id: absence.id,
      practitionerId: absence.practitionerId,
      practitionerName:
        absentPractitioner === undefined
          ? absence.practitionerId
          : `${absentPractitioner.firstName} ${absentPractitioner.lastName}`,
      category: absence.category,
      startsAt: absence.startsAt.toISOString(),
      endsAt: absence.endsAt.toISOString(),
      note: absence.note,
    },
    tasks: ranked,
    outbox: relevant.map(toOutboxView),
    dataIssues: issues.map(toDataIssueView),
  };
}

function startOf(
  appointmentById: Map<string, Appointment>,
  row: AffectedAppointmentRow,
): Date {
  return appointmentById.get(row.terminoAppointmentId)?.startsAt ?? new Date(0);
}

function toAffectedView(
  row: AffectedAppointmentRow,
  appointmentById: Map<string, Appointment>,
  lookup: NameLookup,
) {
  const appointment = appointmentById.get(row.terminoAppointmentId);
  const decision = reviveDecision(row.decision);
  return {
    id: row.id,
    taskId: row.taskId,
    terminoAppointmentId: row.terminoAppointmentId,
    startsAt: (appointment?.startsAt ?? new Date(0)).toISOString(),
    durationMin: appointment?.durationMin ?? 0,
    serviceCode: appointment?.serviceCode ?? null,
    serviceLabel: appointment?.serviceLabel ?? '',
    terminoLocationId: appointment?.terminoLocationId ?? '',
    locationName: lookup.location(appointment?.terminoLocationId ?? '').name,
    patientName: appointment?.patient.name ?? '',
    status: appointment?.status ?? 'cancelled',
    inProgress: row.inProgress,
    imminent: row.imminent,
    duplicateSameDay: row.duplicateSameDay,
    warnings: row.warnings,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString(),
    decision: toDecisionView(decision, lookup),
  };
}

// --- quick actions ----------------------------------------------------------

interface ActionContext {
  affected: AffectedAppointmentRow;
  task: RescheduleTaskRow;
  appointment: Appointment;
  lookup: NameLookup;
}

async function loadActionContext(
  deps: AbsenceServiceDeps,
  affectedId: string,
): Promise<ActionContext> {
  const affected = await getAffectedAppointment(deps.db, deps.tenantId, affectedId);
  if (affected === null) throw new NotFoundError(`Unknown affected appointment ${affectedId}`);
  const task = await getRescheduleTask(deps.db, deps.tenantId, affected.taskId);
  if (task === null) throw new NotFoundError(`Unknown reschedule task ${affected.taskId}`);
  const [appointments, practitioners, locations] = await Promise.all([
    listAppointments(deps.db, deps.tenantId),
    listPractitioners(deps.db, deps.tenantId),
    listLocations(deps.db, deps.tenantId),
  ]);
  const appointment = appointments.find(
    (a) => a.terminoAppointmentId === affected.terminoAppointmentId,
  );
  if (appointment === undefined) {
    throw new NotFoundError(`Unknown appointment ${affected.terminoAppointmentId}`);
  }
  return { affected, task, appointment, lookup: nameLookup(practitioners, locations) };
}

/** Closes the task once no appointment on it is still open. */
async function closeTaskWhenDone(
  deps: AbsenceServiceDeps,
  taskId: string,
  resolvedBy: 'front_desk' | 'system',
): Promise<boolean> {
  const rows = await listAffectedAppointments(deps.db, deps.tenantId, taskId);
  if (rows.some((row) => row.resolution === null)) return false;
  await updateRescheduleTask(deps.db, deps.tenantId, taskId, { status: 'resolved', resolvedBy });
  return true;
}

export interface QuickActionResult {
  affectedId: string;
  taskId: string;
  resolution: Resolution;
  taskClosed: boolean;
  delivery: { delivered: number; failed: number };
}

/** The front desk accepts one of the engine's proposals. */
export async function acceptProposal(
  deps: AbsenceServiceDeps,
  affectedId: string,
  slotIndex: number,
): Promise<QuickActionResult> {
  const context = await loadActionContext(deps, affectedId);
  if (context.affected.resolution !== null) {
    throw new ConflictError('This appointment is already resolved');
  }
  const decision = reviveDecision(context.affected.decision);

  let slot: Slot;
  let resolution: Resolution;
  let payload: TerminoWritePayload;
  if (decision.kind === 'swap_proposal') {
    if (slotIndex !== 0) throw new NotFoundError('A swap proposal has exactly one slot (index 0)');
    slot = decision.slot;
    resolution = 'swapped';
    payload = {
      op: 'swap',
      terminoAppointmentId: context.appointment.terminoAppointmentId,
      terminoPractitionerId: slot.terminoPractitionerId,
    };
  } else if (decision.kind === 'proposal' || decision.kind === 'front_desk') {
    const candidate = decision.candidates[slotIndex];
    if (candidate === undefined) {
      throw new NotFoundError(`No candidate slot at index ${slotIndex}`);
    }
    slot = candidate;
    resolution = 'rebooked';
    payload = {
      op: 'rebook',
      terminoAppointmentId: context.appointment.terminoAppointmentId,
      startsAt: toIso(slot.startsAt),
      terminoPractitionerId: slot.terminoPractitionerId,
      terminoLocationId: slot.terminoLocationId,
    };
  } else {
    throw new ConflictError('The engine already rebooked this appointment');
  }

  await enqueue(deps, 'termino_write', payload);
  await enqueueNotifications(deps, {
    patient: context.appointment.patient,
    template: 'rebooked',
    originalStart: context.appointment.startsAt,
    terminoAppointmentId: context.appointment.terminoAppointmentId,
    newSlot: { slot, lookup: context.lookup },
  });
  await updateAffectedAppointment(deps.db, deps.tenantId, affectedId, {
    resolution,
    resolvedAt: deps.now(),
  });
  const taskClosed = await closeTaskWhenDone(deps, context.task.id, 'front_desk');
  const delivery = await deliverPending(deps);
  return { affectedId, taskId: context.task.id, resolution, taskClosed, delivery };
}

/** No replacement yet: cancel in Termino and tell the patient. */
export async function cancelAndNotify(
  deps: AbsenceServiceDeps,
  affectedId: string,
): Promise<QuickActionResult> {
  const context = await loadActionContext(deps, affectedId);
  if (context.affected.resolution !== null) {
    throw new ConflictError('This appointment is already resolved');
  }
  const payload: TerminoWritePayload = {
    op: 'cancel',
    terminoAppointmentId: context.appointment.terminoAppointmentId,
    reason: 'practitioner absent',
  };
  await enqueue(deps, 'termino_write', payload);
  await enqueueNotifications(deps, {
    patient: context.appointment.patient,
    template: 'cancelled',
    originalStart: context.appointment.startsAt,
    terminoAppointmentId: context.appointment.terminoAppointmentId,
  });
  await updateAffectedAppointment(deps.db, deps.tenantId, affectedId, {
    resolution: 'cancelled',
    resolvedAt: deps.now(),
  });
  const taskClosed = await closeTaskWhenDone(deps, context.task.id, 'front_desk');
  const delivery = await deliverPending(deps);
  return {
    affectedId,
    taskId: context.task.id,
    resolution: 'cancelled',
    taskClosed,
    delivery,
  };
}

export async function logContactAttempt(
  deps: AbsenceServiceDeps,
  taskId: string,
  reached: boolean,
): Promise<RescheduleTaskRow> {
  const task = await getRescheduleTask(deps.db, deps.tenantId, taskId);
  if (task === null) throw new NotFoundError(`Unknown reschedule task ${taskId}`);
  const updated = await updateRescheduleTask(deps.db, deps.tenantId, taskId, {
    contactAttempts: task.contactAttempts + 1,
    status: reached ? 'in_progress' : 'retry_contact',
  });
  if (updated === null) throw new NotFoundError(`Unknown reschedule task ${taskId}`);
  return updated;
}

/** The practitioner turned out to be available: every open appointment stays. */
export async function markKept(
  deps: AbsenceServiceDeps,
  taskId: string,
): Promise<{ taskId: string; keptAppointments: number }> {
  const task = await getRescheduleTask(deps.db, deps.tenantId, taskId);
  if (task === null) throw new NotFoundError(`Unknown reschedule task ${taskId}`);
  const rows = await listAffectedAppointments(deps.db, deps.tenantId, taskId);
  const open = rows.filter((row) => row.resolution === null);
  for (const row of open) {
    await updateAffectedAppointment(deps.db, deps.tenantId, row.id, {
      resolution: 'kept',
      resolvedAt: deps.now(),
    });
  }
  await updateRescheduleTask(deps.db, deps.tenantId, taskId, {
    status: 'resolved',
    resolvedBy: 'front_desk',
  });
  return { taskId, keptAppointments: open.length };
}

// --- export ingest and reconciliation --------------------------------------

export const DEFAULT_EXPORT_FILE = 'termino_export_2026-09-07_0805.json';

export interface IngestDiff {
  exportId: string;
  skipped: boolean;
  added: number;
  changed: number;
  cancelled: number;
  tasksClosed: number;
  tasksAdded: number;
  /** Termino writes this export proved. */
  writesConfirmed: number;
  /** Termino writes still waiting for evidence. */
  writesUnconfirmed: number;
}

interface Snapshot {
  status: string;
  startsAt: number;
  terminoPractitionerId: string;
  terminoPatientId: string;
}

async function snapshot(deps: AbsenceServiceDeps): Promise<Map<string, Snapshot>> {
  const rows = await listAppointments(deps.db, deps.tenantId);
  return new Map(
    rows.map((row) => [
      row.terminoAppointmentId,
      {
        status: row.status,
        startsAt: row.startsAt.getTime(),
        terminoPractitionerId: row.terminoPractitionerId,
        terminoPatientId: row.patient.terminoPatientId,
      },
    ]),
  );
}

/**
 * An outbox row as the confirmation rule sees it. The patient comes from our
 * own copy of the original appointment: a rebooking appears in the export under
 * an id Termino minted, so the patient plus the new slot is the only handle we
 * have on it.
 */
function toUnconfirmedWrite(row: OutboxRow, before: Map<string, Snapshot>): UnconfirmedWrite {
  const payload = row.payload as TerminoWritePayload & {
    localAppointmentId?: string;
    deliveredAtExportCount?: number;
  };
  const terminoAppointmentId =
    'terminoAppointmentId' in payload ? payload.terminoAppointmentId : undefined;
  return {
    id: row.id,
    op: payload.op,
    status: row.status === 'pending' ? 'pending' : 'delivered',
    terminoAppointmentId,
    terminoPractitionerId:
      'terminoPractitionerId' in payload ? payload.terminoPractitionerId : undefined,
    startsAt: 'startsAt' in payload ? payload.startsAt : undefined,
    terminoPatientId:
      terminoAppointmentId === undefined
        ? undefined
        : before.get(terminoAppointmentId)?.terminoPatientId,
    localAppointmentId: payload.localAppointmentId,
    deliveredAtExportCount: payload.deliveredAtExportCount,
  };
}

/** Keeps a caller-supplied path inside `DATA_DIR`. */
export function resolveExportPath(relativePath: string): string {
  const base = resolve(dataDir());
  const candidate = resolve(base, normalize(relativePath));
  if (isAbsolute(relativePath) || !candidate.startsWith(base)) {
    throw new NotFoundError('The export path must stay inside the data directory');
  }
  return candidate;
}

export async function ingestExportFile(
  deps: AbsenceServiceDeps,
  relativePath: string = DEFAULT_EXPORT_FILE,
): Promise<IngestDiff> {
  const path = resolveExportPath(relativePath);
  const before = await snapshot(deps);

  // Everything we wrote to Termino and nobody has proved yet. The ingest must
  // leave those rows alone, and they are what the reconciliation looks for.
  const openWrites = await listUnconfirmedTerminoWrites(deps.db, deps.tenantId);
  const protectedIds = protectedAppointmentIdsOf(openWrites);

  let result;
  try {
    result = await ingestExport(deps.db, path, deps.tenantId, {
      protectedAppointmentIds: protectedIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new NotFoundError(`Cannot read export ${relativePath}: ${message}`);
  }
  const after = await snapshot(deps);

  let added = 0;
  let changed = 0;
  let cancelled = 0;
  const addedIds: string[] = [];
  for (const [id, now] of after) {
    const then = before.get(id);
    if (then === undefined) {
      added += 1;
      addedIds.push(id);
      continue;
    }
    if (then.status !== 'cancelled' && now.status === 'cancelled') {
      cancelled += 1;
      continue;
    }
    if (
      then.startsAt !== now.startsAt ||
      then.terminoPractitionerId !== now.terminoPractitionerId
    ) {
      changed += 1;
    }
  }

  const tasksClosed = await closeExternallyResolved(deps, before, after, protectedIds);
  const tasksAdded = await addTasksForNewBookings(deps, addedIds, after);
  const writes = result.skipped
    ? { confirmed: 0, unconfirmed: openWrites.length }
    : await confirmWrites(deps, path, openWrites, before);

  return {
    exportId: result.exportId,
    skipped: result.skipped,
    added,
    changed,
    cancelled,
    tasksClosed,
    tasksAdded,
    writesConfirmed: writes.confirmed,
    writesUnconfirmed: writes.unconfirmed,
  };
}

/**
 * The confirmation half of the reconciliation (ADR-0001). The export decides:
 * a write is `confirmed` once the export shows it, a rebooking hands its local
 * `apt_local_*` row over to the real booking Termino minted, and a write that
 * has sat through two exports is flagged so the drift is visible.
 */
async function confirmWrites(
  deps: AbsenceServiceDeps,
  path: string,
  openWrites: OutboxRow[],
  before: Map<string, Snapshot>,
): Promise<{ confirmed: number; unconfirmed: number }> {
  if (openWrites.length === 0) return { confirmed: 0, unconfirmed: 0 };

  const [exportAppointments, exportCount] = await Promise.all([
    readExportAppointments(path),
    countTerminoExports(deps.db, deps.tenantId),
  ]);
  const outcome = reconcileWrites({
    writes: openWrites.map((row) => toUnconfirmedWrite(row, before)),
    exportAppointments,
    exportCount,
  });

  const confirmedAt = deps.now().toISOString();
  for (const write of outcome.outcomes) {
    if (write.confirmed) {
      await markOutboxConfirmed(deps.db, write.id, {
        confirmedAt,
        confirmedBy: 'export',
        ...(write.confirmedAs === undefined ? {} : { confirmedAs: write.confirmedAs }),
      });
      // The real booking is in our tables now; ours would double-book the patient.
      if (write.retireAppointmentId !== undefined) {
        await deleteAppointmentRow(deps.db, deps.tenantId, write.retireAppointmentId);
      }
      continue;
    }
    if (write.staleAfterExports !== undefined) {
      await patchOutboxPayload(deps.db, write.id, {
        staleAfterExports: write.staleAfterExports,
      });
    }
  }

  return { confirmed: outcome.confirmed, unconfirmed: outcome.unconfirmed };
}

/**
 * An appointment someone changed or cancelled directly in Termino no longer
 * needs the front desk. Mark it `resolved_externally` and close the task when
 * nothing else on it is open. Rows a local write owns are skipped: only a
 * change we did not make counts as resolved externally (ADR-0001).
 */
async function closeExternallyResolved(
  deps: AbsenceServiceDeps,
  before: Map<string, Snapshot>,
  after: Map<string, Snapshot>,
  protectedIds: Set<string>,
): Promise<number> {
  const rows = await listUnresolvedAffectedAppointments(deps.db, deps.tenantId);
  const touchedTasks = new Set<string>();
  for (const row of rows) {
    // Our own write is not an external change, so it never resolves a task.
    if (protectedIds.has(row.affected.terminoAppointmentId)) continue;
    const then = before.get(row.affected.terminoAppointmentId);
    const now = after.get(row.affected.terminoAppointmentId);
    if (then === undefined || now === undefined) continue;
    const externallyCancelled = then.status !== 'cancelled' && now.status === 'cancelled';
    const moved =
      then.startsAt !== now.startsAt ||
      then.terminoPractitionerId !== now.terminoPractitionerId;
    if (!externallyCancelled && !moved) continue;
    await updateAffectedAppointment(deps.db, deps.tenantId, row.affected.id, {
      resolution: 'resolved_externally',
      resolvedAt: deps.now(),
    });
    touchedTasks.add(row.task.id);
  }

  let closed = 0;
  for (const taskId of touchedTasks) {
    if (await closeTaskWhenDone(deps, taskId, 'system')) closed += 1;
  }
  return closed;
}

/** A booking made after the block still lands inside the absence; plan it too. */
async function addTasksForNewBookings(
  deps: AbsenceServiceDeps,
  addedIds: string[],
  after: Map<string, Snapshot>,
): Promise<number> {
  if (addedIds.length === 0) return 0;
  const now = deps.now();
  const [absences, practitioners, locations] = await Promise.all([
    listAbsences(deps.db, deps.tenantId),
    listPractitioners(deps.db, deps.tenantId),
    listLocations(deps.db, deps.tenantId),
  ]);
  const lookup = nameLookup(practitioners, locations);
  const byId = new Map(practitioners.map((p) => [p.id, p]));
  let tasksAdded = 0;

  for (const absence of absences) {
    if (absence.endsAt.getTime() <= now.getTime()) continue;
    const practitioner = byId.get(absence.practitionerId);
    if (practitioner === undefined) continue;

    const fresh = addedIds.filter((id) => {
      const row = after.get(id);
      return (
        row !== undefined &&
        row.status === 'booked' &&
        row.terminoPractitionerId === practitioner.terminoPractitionerId &&
        row.startsAt < absence.endsAt.getTime() &&
        row.startsAt >= absence.startsAt.getTime()
      );
    });
    if (fresh.length === 0) continue;

    const engineInput = await loadInput(deps, absence);
    const decisions = decide(engineInput).filter((entry) =>
      fresh.includes(entry.affected.appointment.terminoAppointmentId),
    );
    for (const [terminoPatientId, group] of groupByPatient(decisions)) {
      await persistTask(deps, absence.id, terminoPatientId, group, lookup);
      tasksAdded += 1;
    }
  }

  if (tasksAdded > 0) await deliverPending(deps);
  return tasksAdded;
}

export async function listOpenDataIssueViews(deps: AbsenceServiceDeps) {
  const rows = await listOpenDataIssues(deps.db, deps.tenantId);
  return rows.map(toDataIssueView);
}

export async function listPractitionerViews(deps: AbsenceServiceDeps) {
  const rows = await listPractitioners(deps.db, deps.tenantId);
  return rows.map((row) => ({
    id: row.id,
    terminoPractitionerId: row.terminoPractitionerId,
    firstName: row.firstName,
    lastName: row.lastName,
    qualifications: row.qualifications,
  }));
}
