/**
 * Request and response shapes for the absence use cases. The API and the web
 * app share these; nothing at the boundary is hand-typed twice.
 * All instants are ISO 8601 UTC strings.
 */
import { z } from 'zod';
import {
  absenceCategorySchema,
  appointmentStatusSchema,
  dataIssueKindSchema,
  dataIssueStatusSchema,
  outboxKindSchema,
  outboxStatusSchema,
  rescheduleTaskStatusSchema,
  resolutionSchema,
  serviceCodeSchema,
} from './enums.js';

export const errorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const idParamSchema = z.object({ id: z.uuid() });
export const absenceTaskParamsSchema = z.object({ id: z.uuid(), taskId: z.uuid() });

export const createAbsenceRequestSchema = z.object({
  practitionerId: z.uuid(),
  category: absenceCategorySchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  note: z.string().max(2000).nullish(),
});
export type CreateAbsenceRequest = z.infer<typeof createAbsenceRequestSchema>;

export const createAbsenceResponseSchema = z.object({
  absenceId: z.uuid(),
  counts: z.object({
    affectedAppointments: z.int().nonnegative(),
    tasks: z.int().nonnegative(),
    tasksResolvedBySystem: z.int().nonnegative(),
    autoRebooks: z.int().nonnegative(),
    swapProposals: z.int().nonnegative(),
    proposals: z.int().nonnegative(),
    frontDesk: z.int().nonnegative(),
    terminoWrites: z.int().nonnegative(),
    notifications: z.int().nonnegative(),
  }),
  delivery: z.object({
    delivered: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
});
export type CreateAbsenceResponse = z.infer<typeof createAbsenceResponseSchema>;

export const absenceSummarySchema = z.object({
  id: z.uuid(),
  practitionerId: z.uuid(),
  practitionerName: z.string(),
  category: absenceCategorySchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  note: z.string().nullable(),
  taskCount: z.int().nonnegative(),
  openTaskCount: z.int().nonnegative(),
});
export const absenceListResponseSchema = z.object({ absences: z.array(absenceSummarySchema) });
export type AbsenceListResponse = z.infer<typeof absenceListResponseSchema>;

export const slotViewSchema = z.object({
  terminoPractitionerId: z.string(),
  practitionerName: z.string(),
  terminoLocationId: z.string(),
  locationName: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
export type SlotView = z.infer<typeof slotViewSchema>;

export const decisionKindSchema = z.enum([
  'auto_rebook',
  'swap_proposal',
  'proposal',
  'front_desk',
]);

export const frontDeskReasonSchema = z.enum([
  'in_progress',
  'imminent_no_swap',
  'no_slot',
  'not_contactable',
]);

/**
 * One flat shape for all four decision kinds. A discriminated union would be
 * closer to the domain type but harder to consume from a form; `kind` still
 * tells the client which fields carry meaning.
 */
export const decisionViewSchema = z.object({
  kind: decisionKindSchema,
  slot: slotViewSchema.nullable(),
  todayCancelled: z.boolean(),
  candidates: z.array(slotViewSchema),
  sameDayImpossible: z.boolean(),
  reason: frontDeskReasonSchema.nullable(),
});
export type DecisionView = z.infer<typeof decisionViewSchema>;

export const prescriptionWarningSchema = z.object({
  code: z.enum([
    'no_prescription',
    'start_deadline',
    'interruption',
    'below_frequency',
    'units_nearly_used',
  ]),
  detail: z.string(),
});

export const affectedAppointmentViewSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  terminoAppointmentId: z.string(),
  startsAt: z.iso.datetime(),
  durationMin: z.int().nonnegative(),
  serviceCode: serviceCodeSchema.nullable(),
  serviceLabel: z.string(),
  terminoLocationId: z.string(),
  locationName: z.string(),
  patientName: z.string(),
  status: appointmentStatusSchema,
  inProgress: z.boolean(),
  imminent: z.boolean(),
  duplicateSameDay: z.boolean(),
  warnings: z.array(prescriptionWarningSchema),
  resolution: resolutionSchema.nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  decision: decisionViewSchema,
});
export type AffectedAppointmentView = z.infer<typeof affectedAppointmentViewSchema>;

export const rescheduleTaskViewSchema = z.object({
  id: z.uuid(),
  absenceId: z.uuid(),
  terminoPatientId: z.string(),
  patientName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: rescheduleTaskStatusSchema,
  contactAttempts: z.int().nonnegative(),
  pinned: z.boolean(),
  resolvedBy: z.enum(['system', 'front_desk']).nullable(),
  warningCount: z.int().nonnegative(),
  earliestStartsAt: z.iso.datetime(),
  phoneContactable: z.boolean(),
  affectedAppointments: z.array(affectedAppointmentViewSchema),
});
export type RescheduleTaskView = z.infer<typeof rescheduleTaskViewSchema>;

export const outboxEntryViewSchema = z.object({
  id: z.uuid(),
  kind: outboxKindSchema,
  status: outboxStatusSchema,
  attempts: z.int().nonnegative(),
  lastError: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type OutboxEntryView = z.infer<typeof outboxEntryViewSchema>;

export const dataIssueViewSchema = z.object({
  id: z.uuid(),
  kind: dataIssueKindSchema,
  status: dataIssueStatusSchema,
  ref: z.record(z.string(), z.unknown()),
  candidates: z.array(
    z.object({
      patientId: z.string(),
      matchedOn: z.array(z.enum(['birthDate', 'phone', 'email'])),
    }),
  ),
});
export type DataIssueView = z.infer<typeof dataIssueViewSchema>;

export const absenceViewSchema = z.object({
  absence: z.object({
    id: z.uuid(),
    practitionerId: z.uuid(),
    practitionerName: z.string(),
    category: absenceCategorySchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    note: z.string().nullable(),
  }),
  tasks: z.array(rescheduleTaskViewSchema),
  outbox: z.array(outboxEntryViewSchema),
  dataIssues: z.array(dataIssueViewSchema),
});
export type AbsenceView = z.infer<typeof absenceViewSchema>;

export const contactAttemptRequestSchema = z.object({ reached: z.boolean() });
export const rescheduleTaskStateSchema = z.object({
  id: z.uuid(),
  status: rescheduleTaskStatusSchema,
  contactAttempts: z.int().nonnegative(),
  resolvedBy: z.enum(['system', 'front_desk']).nullable(),
});
export type RescheduleTaskState = z.infer<typeof rescheduleTaskStateSchema>;

export const markKeptResponseSchema = z.object({
  taskId: z.uuid(),
  keptAppointments: z.int().nonnegative(),
});

export const acceptProposalRequestSchema = z.object({
  slotIndex: z.int().nonnegative().default(0),
});

export const quickActionResponseSchema = z.object({
  affectedId: z.uuid(),
  taskId: z.uuid(),
  resolution: resolutionSchema,
  taskClosed: z.boolean(),
  delivery: z.object({
    delivered: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
});
export type QuickActionResponse = z.infer<typeof quickActionResponseSchema>;

export const ingestRequestSchema = z.object({
  /** Relative to `DATA_DIR`. Defaults to the 08:05 export. */
  path: z.string().min(1).max(255).optional(),
});

export const ingestResponseSchema = z.object({
  exportId: z.string(),
  skipped: z.boolean(),
  added: z.int().nonnegative(),
  changed: z.int().nonnegative(),
  cancelled: z.int().nonnegative(),
  tasksClosed: z.int().nonnegative(),
  tasksAdded: z.int().nonnegative(),
  /** Termino writes this export proved, and those still waiting (ADR-0001). */
  writesConfirmed: z.int().nonnegative(),
  writesUnconfirmed: z.int().nonnegative(),
});
export type IngestResponse = z.infer<typeof ingestResponseSchema>;

export const dataIssueListResponseSchema = z.object({ dataIssues: z.array(dataIssueViewSchema) });

export const practitionerViewSchema = z.object({
  id: z.uuid(),
  terminoPractitionerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  qualifications: z.array(serviceCodeSchema),
});
export const practitionerListResponseSchema = z.object({
  practitioners: z.array(practitionerViewSchema),
});
export type PractitionerListResponse = z.infer<typeof practitionerListResponseSchema>;

// --- task queue -------------------------------------------------------------
// One queue across all absences. `GET /tasks` powers the front-desk cockpit:
// the front desk works one ranked list, not one list per absence.

export const queueAbsenceRefSchema = z.object({
  id: z.uuid(),
  practitionerName: z.string(),
  category: absenceCategorySchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
export type QueueAbsenceRef = z.infer<typeof queueAbsenceRefSchema>;

export const queuePatientSchema = z.object({
  terminoPatientId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type QueuePatient = z.infer<typeof queuePatientSchema>;

export const queuedTaskViewSchema = z.object({
  id: z.uuid(),
  absence: queueAbsenceRefSchema,
  patient: queuePatientSchema,
  status: rescheduleTaskStatusSchema,
  contactAttempts: z.int().nonnegative(),
  pinned: z.boolean(),
  resolvedBy: z.enum(['system', 'front_desk']).nullable(),
  /** Union of the prescription warnings of every affected appointment. */
  warnings: z.array(prescriptionWarningSchema),
  warningCount: z.int().nonnegative(),
  earliestStartsAt: z.iso.datetime(),
  phoneContactable: z.boolean(),
  affectedAppointments: z.array(affectedAppointmentViewSchema),
});
export type QueuedTaskView = z.infer<typeof queuedTaskViewSchema>;

export const taskQueueQuerySchema = z.object({
  status: z.enum(['open', 'all']).default('open'),
});
export type TaskQueueQuery = z.infer<typeof taskQueueQuerySchema>;

export const taskQueueResponseSchema = z.object({ tasks: z.array(queuedTaskViewSchema) });
export type TaskQueueResponse = z.infer<typeof taskQueueResponseSchema>;
