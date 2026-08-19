/**
 * Typed HTTP client for the API. Request and response shapes come from
 * `@ausfall/contracts`, so the boundary is typed end to end and nothing is
 * hand-typed twice. There is no mock any more: the API is the source of truth.
 */
import type {
  AbsenceListResponse,
  AbsenceView,
  CreateAbsenceRequest,
  CreateAbsenceResponse,
  DataIssueView,
  IngestResponse,
  PractitionerListResponse,
  QuickActionResponse,
  RescheduleTaskState,
  TaskQueueResponse,
} from '@ausfall/contracts'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(response.status, body?.error ?? `${response.status} ${path}`)
  }
  return (await response.json()) as T
}

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export const api = {
  listPractitioners: () =>
    request<PractitionerListResponse>('/practitioners').then((r) => r.practitioners),

  listAbsences: () => request<AbsenceListResponse>('/absences').then((r) => r.absences),

  getAbsence: (id: string) => request<AbsenceView>(`/absences/${encodeURIComponent(id)}`),

  listTasks: (status: 'open' | 'all') =>
    request<TaskQueueResponse>(`/tasks?status=${status}`).then((r) => r.tasks),

  listDataIssues: () =>
    request<{ dataIssues: DataIssueView[] }>('/data-issues').then((r) => r.dataIssues),

  createAbsence: (body: CreateAbsenceRequest) =>
    post<CreateAbsenceResponse>('/absences', body),

  logContactAttempt: (absenceId: string, taskId: string, reached: boolean) =>
    post<RescheduleTaskState>(
      `/absences/${encodeURIComponent(absenceId)}/tasks/${encodeURIComponent(taskId)}/contact-attempts`,
      { reached },
    ),

  markKept: (absenceId: string, taskId: string) =>
    post<{ taskId: string; keptAppointments: number }>(
      `/absences/${encodeURIComponent(absenceId)}/tasks/${encodeURIComponent(taskId)}/kept`,
    ),

  acceptProposal: (affectedId: string, slotIndex: number) =>
    post<QuickActionResponse>(
      `/affected-appointments/${encodeURIComponent(affectedId)}/accept-proposal`,
      { slotIndex },
    ),

  cancelAppointment: (affectedId: string) =>
    post<QuickActionResponse>(`/affected-appointments/${encodeURIComponent(affectedId)}/cancel`),

  ingestExport: (path: string) => post<IngestResponse>('/exports/ingest', { path }),
}
