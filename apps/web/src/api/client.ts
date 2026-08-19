/**
 * Typed API client.
 *
 * `VITE_API_URL` unset -> the built-in mock. Set it to wire the real API:
 * `HttpApiClient` implements the same `ApiClient` interface.
 */
import { MOCK_ABSENCE, MOCK_PRACTITIONERS } from './mock'
import type {
  AbsenceView,
  ApiClient,
  CreateAbsenceInput,
  CreateAbsenceResult,
  PractitionerOption,
  QuickActionInput,
  ResolveDataIssueInput,
  UndoAutomatedActionInput,
} from './types'

const apiUrl = import.meta.env.VITE_API_URL

export const USE_MOCK = apiUrl === undefined || apiUrl === ''

function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class MockApiClient implements ApiClient {
  async listPractitioners(): Promise<PractitionerOption[]> {
    await delay(0)
    return MOCK_PRACTITIONERS
  }

  async createAbsence(input: CreateAbsenceInput): Promise<CreateAbsenceResult> {
    await delay()
    const suffix = Math.random().toString(36).slice(2, 8)
    return { id: `abs_${input.terminoPractitionerId}_${suffix}` }
  }

  async getAbsenceView(id: string): Promise<AbsenceView> {
    await delay()
    return { ...MOCK_ABSENCE, id }
  }

  async runQuickAction(input: QuickActionInput): Promise<void> {
    await delay()
    // The mock only acknowledges. The real client will POST and the caller refetches.
    void input
  }

  async undoAutomatedAction(input: UndoAutomatedActionInput): Promise<void> {
    await delay()
    void input
  }

  async resolveDataIssue(input: ResolveDataIssueInput): Promise<void> {
    await delay()
    void input
  }
}

class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${path}`)
    }
    return (await response.json()) as T
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  listPractitioners(): Promise<PractitionerOption[]> {
    return this.request<PractitionerOption[]>('/practitioners')
  }

  createAbsence(input: CreateAbsenceInput): Promise<CreateAbsenceResult> {
    return this.post<CreateAbsenceResult>('/absences', input)
  }

  getAbsenceView(id: string): Promise<AbsenceView> {
    return this.request<AbsenceView>(`/absences/${encodeURIComponent(id)}/view`)
  }

  async runQuickAction(input: QuickActionInput): Promise<void> {
    await this.post(`/absences/${encodeURIComponent(input.absenceId)}/quick-actions`, input)
  }

  async undoAutomatedAction(input: UndoAutomatedActionInput): Promise<void> {
    await this.post(`/absences/${encodeURIComponent(input.absenceId)}/automated-actions/undo`, input)
  }

  async resolveDataIssue(input: ResolveDataIssueInput): Promise<void> {
    await this.post(`/absences/${encodeURIComponent(input.absenceId)}/data-issues/resolve`, input)
  }
}

export const apiClient: ApiClient =
  apiUrl === undefined || apiUrl === '' ? new MockApiClient() : new HttpApiClient(apiUrl)

export const listPractitioners = (): Promise<PractitionerOption[]> => apiClient.listPractitioners()
export const createAbsence = (input: CreateAbsenceInput): Promise<CreateAbsenceResult> =>
  apiClient.createAbsence(input)
export const getAbsenceView = (id: string): Promise<AbsenceView> => apiClient.getAbsenceView(id)
export const runQuickAction = (input: QuickActionInput): Promise<void> =>
  apiClient.runQuickAction(input)
export const undoAutomatedAction = (input: UndoAutomatedActionInput): Promise<void> =>
  apiClient.undoAutomatedAction(input)
export const resolveDataIssue = (input: ResolveDataIssueInput): Promise<void> =>
  apiClient.resolveDataIssue(input)
