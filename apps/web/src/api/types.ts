/**
 * View contract between the web app and the API.
 *
 * Domain unions come from `@ausfall/domain` so the vocabulary stays in one place.
 * Instants are ISO 8601 UTC strings here because this shape crosses the wire.
 */
import type {
  AbsenceCategory,
  EngineDecision,
  PrescriptionWarning,
  RescheduleTaskStatus,
  ServiceCode,
} from '@ausfall/domain'

export type { AbsenceCategory, PrescriptionWarning, RescheduleTaskStatus, ServiceCode }

/** Kinds and reasons stay tied to the engine decision union. */
export type DecisionKind = EngineDecision['kind']
export type FrontDeskReason = Extract<EngineDecision, { kind: 'front_desk' }>['reason']

export interface PractitionerOption {
  terminoPractitionerId: string
  name: string
}

export interface SlotView {
  terminoPractitionerId: string
  practitionerName: string
  terminoLocationId: string
  locationName: string
  /** ISO 8601 UTC. */
  startsAt: string
  /** ISO 8601 UTC. */
  endsAt: string
}

export type DecisionView =
  | { kind: 'auto_rebook'; slot: SlotView; todayCancelled: boolean }
  | { kind: 'swap_proposal'; slot: SlotView }
  | { kind: 'proposal'; candidates: SlotView[]; sameDayImpossible: boolean }
  | {
      kind: 'front_desk'
      reason: FrontDeskReason
      candidates: SlotView[]
      sameDayImpossible: boolean
    }

export interface AppointmentView {
  terminoAppointmentId: string
  /** ISO 8601 UTC. */
  startsAt: string
  durationMin: number
  serviceCode: ServiceCode | null
  serviceLabel: string
  terminoLocationId: string
  locationName: string
  inProgress: boolean
  imminent: boolean
}

export interface AffectedAppointmentView {
  appointment: AppointmentView
  decision: DecisionView
  warnings: PrescriptionWarning[]
  duplicateSameDay: boolean
}

export interface PatientContactView {
  name: string
  phone: string | null
  email: string | null
  /** false when no phone number is on file. */
  reachableByPhone: boolean
  /** true when the patient has no confirmed link to our master data. */
  unmatched: boolean
}

export interface RescheduleTaskView {
  id: string
  patient: PatientContactView
  status: RescheduleTaskStatus
  contactAttempts: number
  /** Lower number means "handle first". */
  rank: number
  appointments: AffectedAppointmentView[]
}

export interface AutomatedActionView {
  id: string
  patientName: string
  from: {
    /** ISO 8601 UTC. */
    startsAt: string
    practitionerName: string
    locationName: string
  }
  to: SlotView
  notificationSent: boolean
  undone: boolean
}

export type TerminoWriteOp = 'block_practitioner' | 'rebook' | 'swap' | 'cancel'
export type TerminoWriteStatus = 'pending' | 'delivered' | 'confirmed' | 'failed'

export interface TerminoWriteView {
  id: string
  op: TerminoWriteOp
  target: string
  status: TerminoWriteStatus
  /** ISO 8601 UTC. */
  createdAt: string
}

export type NotificationChannel = 'email' | 'sms'
export type NotificationStatus = 'pending' | 'sent' | 'failed'

export interface NotificationView {
  id: string
  channel: NotificationChannel
  recipient: string
  subject: string
  status: NotificationStatus
  /** ISO 8601 UTC. */
  createdAt: string
}

export type DataIssueKind = 'unmatched_patient' | 'fuzzy_patient_match' | 'unknown_practitioner'

export interface FuzzyMatchCandidateView {
  patientId: string
  name: string
  birthDate: string
  /** Field names that matched, for example `last_name`, `birth_date`. */
  matchedFields: string[]
}

export interface DataIssueView {
  id: string
  kind: DataIssueKind
  subject: string
  detail: string
  candidates: FuzzyMatchCandidateView[]
}

export interface AbsenceView {
  id: string
  practitionerName: string
  terminoPractitionerId: string
  category: AbsenceCategory
  /** ISO 8601 UTC. */
  startsAt: string
  /** ISO 8601 UTC. */
  endsAt: string
  note: string | null
  tasks: RescheduleTaskView[]
  automatedActions: AutomatedActionView[]
  terminoWrites: TerminoWriteView[]
  notifications: NotificationView[]
  dataIssues: DataIssueView[]
}

export interface CreateAbsenceInput {
  terminoPractitionerId: string
  category: AbsenceCategory
  /** ISO 8601 UTC. */
  startsAt: string
  /** ISO 8601 UTC. */
  endsAt: string
  note: string | null
}

export interface CreateAbsenceResult {
  id: string
}

export type QuickAction =
  | 'accept_proposal'
  | 'cancel_and_notify'
  | 'rebooked_manually'
  | 'log_contact_attempt'

export interface QuickActionInput {
  absenceId: string
  taskId: string
  terminoAppointmentId?: string
  action: QuickAction
  slot?: SlotView
}

export type UndoReason = 'patient_declined' | 'practitioner_available' | 'wrong_slot' | 'other'
export type UndoNextStep =
  | 'front_desk_will_call'
  | 'takes_place_as_planned'
  | 'cancel_without_replacement'

export interface UndoAutomatedActionInput {
  absenceId: string
  actionId: string
  reason: UndoReason
  nextStep: UndoNextStep
  message: string
}

export interface ResolveDataIssueInput {
  absenceId: string
  issueId: string
  candidatePatientId?: string
}

/** One interface, two implementations: the mock below and a future HTTP client. */
export interface ApiClient {
  listPractitioners(): Promise<PractitionerOption[]>
  createAbsence(input: CreateAbsenceInput): Promise<CreateAbsenceResult>
  getAbsenceView(id: string): Promise<AbsenceView>
  runQuickAction(input: QuickActionInput): Promise<void>
  undoAutomatedAction(input: UndoAutomatedActionInput): Promise<void>
  resolveDataIssue(input: ResolveDataIssueInput): Promise<void>
}
