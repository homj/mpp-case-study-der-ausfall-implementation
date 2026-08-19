/**
 * Rules that turn one reschedule task into the two things a front-desk row
 * shows: which part of the day it belongs to, and what to do about it.
 */
import type { AffectedAppointmentView, QueuedTaskView } from '@ausfall/contracts'
import { DISPLAY_TIME_ZONE } from './datetime'

export type DayGroup = 'now' | 'morning' | 'afternoon'
export const DAY_GROUPS: DayGroup[] = ['now', 'morning', 'afternoon']

/** Berlin wall-clock hour that ends the "Jetzt" group. */
const NOW_UNTIL_HOUR = 9
/** Berlin wall-clock hour that starts the "Nachmittag" group. */
const AFTERNOON_FROM_HOUR = 13

function berlinHour(value: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(value))
  return Number(hour)
}

export function groupOf(task: QueuedTaskView): DayGroup {
  const hour = berlinHour(task.earliestStartsAt)
  if (hour < NOW_UNTIL_HOUR) return 'now'
  return hour < AFTERNOON_FROM_HOUR ? 'morning' : 'afternoon'
}

/** The appointment the front desk acts on first: the earliest unresolved one. */
export function leadAppointment(task: QueuedTaskView): AffectedAppointmentView | undefined {
  const open = task.affectedAppointments.filter((item) => item.resolution === null)
  return (open.length > 0 ? open : task.affectedAppointments)[0]
}

export function openAppointments(task: QueuedTaskView): AffectedAppointmentView[] {
  return task.affectedAppointments.filter((item) => item.resolution === null)
}

/** i18n key for the one-line "what to do" of a row. */
export function todoKey(task: QueuedTaskView): string {
  const lead = leadAppointment(task)
  if (lead === undefined) return 'queue.todo.front_desk'
  const { kind, reason } = lead.decision
  if (kind === 'front_desk' && reason !== null) return `queue.todo.front_desk_${reason}`
  return `queue.todo.${kind}`
}

export function isUrgent(task: QueuedTaskView): boolean {
  const lead = leadAppointment(task)
  return lead !== undefined && lead.decision.kind === 'front_desk' && lead.imminent
}
