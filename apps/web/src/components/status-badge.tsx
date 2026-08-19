/**
 * Semantic colors for task state. Color is never the only signal: every badge
 * keeps its text label, and the palette is shared with the progress bars so
 * "green" means the same thing everywhere.
 */
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QueuedTaskView, RescheduleTaskStatusContract } from '@ausfall/contracts'

export type Tone = 'done' | 'assistant' | 'open' | 'attention' | 'neutral'

export const toneClass: Record<Tone, string> = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  assistant:
    'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100',
  open: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  attention:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  neutral: '',
}

/** Fill colors for the segmented progress bar on the absences page. */
export const toneFill: Record<Tone, string> = {
  done: 'bg-emerald-500',
  assistant: 'bg-sky-500',
  open: 'bg-red-500',
  attention: 'bg-amber-500',
  neutral: 'bg-muted',
}

export function toneOf(task: Pick<QueuedTaskView, 'status' | 'resolvedBy'>): Tone {
  if (task.status === 'resolved') return task.resolvedBy === 'system' ? 'assistant' : 'done'
  if (task.status === 'retry_contact' || task.status === 'in_progress') return 'attention'
  return 'open'
}

export function StatusBadge({
  status,
  resolvedBy,
  className,
}: {
  status: RescheduleTaskStatusContract
  resolvedBy: 'system' | 'front_desk' | null
  className?: string
}) {
  const { t } = useTranslation()
  const tone = toneOf({ status, resolvedBy })
  const label =
    status === 'resolved' && resolvedBy === 'system'
      ? t('tasks.status.resolved_by_system')
      : t(`tasks.status.${status}`)
  return (
    <Badge variant="outline" className={cn(toneClass[tone], className)}>
      {label}
    </Badge>
  )
}

/** A stable color per absence, so the dot on a chip matches its rows. */
const ABSENCE_DOTS = ['bg-violet-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500', 'bg-lime-500']

export function absenceDotClass(index: number): string {
  return ABSENCE_DOTS[index % ABSENCE_DOTS.length] ?? 'bg-muted-foreground'
}
