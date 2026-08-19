/**
 * Flow 2: "Offene Fälle" — one queue across every absence, grouped by time of
 * day. A click opens the case in a sheet; outcomes advance to the next case.
 */
import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { useTasks } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { CaseSheet } from '@/components/case-sheet'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocale } from '@/i18n/use-locale'
import { formatTime } from '@/lib/datetime'
import { DAY_GROUPS, groupOf, leadAppointment, todoKey } from '@/lib/queue'
import type { DayGroup } from '@/lib/queue'
import type { QueuedTaskView } from '@ausfall/contracts'

type QueueSearch = { absence?: string }

export const Route = createFileRoute('/queue')({
  validateSearch: (search: Record<string, unknown>): QueueSearch => ({
    absence: typeof search.absence === 'string' ? search.absence : undefined,
  }),
  component: QueuePage,
})

function QueuePage() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const all = useTasks('all')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showFinished, setShowFinished] = useState(false)

  const tasks = all.data ?? []
  const filtered = useMemo(
    () =>
      search.absence === undefined
        ? tasks
        : tasks.filter((task) => task.absence.id === search.absence),
    [tasks, search.absence],
  )
  const openTasks = filtered.filter((task) => task.status !== 'resolved')
  const finished = filtered.filter((task) => task.status === 'resolved')
  const bySystem = finished.filter((task) => task.resolvedBy === 'system').length
  const byFrontDesk = finished.filter((task) => task.resolvedBy === 'front_desk').length

  const absences = useMemo(() => {
    const map = new Map<string, QueuedTaskView['absence'] & { count: number }>()
    for (const task of tasks) {
      const entry = map.get(task.absence.id) ?? { ...task.absence, count: 0 }
      if (task.status !== 'resolved') entry.count += 1
      map.set(task.absence.id, entry)
    }
    return [...map.values()]
  }, [tasks])

  const groups: [DayGroup, QueuedTaskView[]][] = DAY_GROUPS.map((group) => [
    group,
    openTasks.filter((task) => groupOf(task) === group),
  ])

  const selected = filtered.find((task) => task.id === selectedId)

  function next() {
    const remaining = openTasks.filter((task) => task.id !== selectedId)
    setSelectedId(remaining[0]?.id ?? null)
  }

  function setFilter(absenceId: string | undefined) {
    void navigate({ search: absenceId === undefined ? {} : { absence: absenceId } })
  }

  if (all.isPending) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (all.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('app.error_title')}</AlertTitle>
        <AlertDescription>{(all.error as Error).message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('queue.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {openTasks.length === 0
            ? t('queue.all_done')
            : t('queue.subtitle', { count: openTasks.length })}
        </p>
      </header>

      {absences.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('queue.filter_label')}>
          <Button
            size="sm"
            variant={search.absence === undefined ? 'default' : 'outline'}
            aria-pressed={search.absence === undefined}
            onClick={() => setFilter(undefined)}
          >
            {t('queue.filter_all', { count: openTasks.length })}
          </Button>
          {absences.map((absence) => (
            <Button
              key={absence.id}
              size="sm"
              variant={search.absence === absence.id ? 'default' : 'outline'}
              aria-pressed={search.absence === absence.id}
              onClick={() => setFilter(absence.id)}
            >
              {absence.practitionerName} {absence.count}
            </Button>
          ))}
        </div>
      ) : null}

      {openTasks.length === 0 ? (
        <Card>
          <CardContent className="grid gap-1 py-8 text-center">
            <p className="font-medium">{t('queue.empty_title')}</p>
            <p className="text-muted-foreground text-sm">{t('queue.empty_body')}</p>
          </CardContent>
        </Card>
      ) : (
        groups
          .filter(([, items]) => items.length > 0)
          .map(([group, items]) => (
            <section key={group} aria-labelledby={`group-${group}`} className="grid gap-2">
              <h2 id={`group-${group}`} className="text-muted-foreground text-sm font-semibold">
                {t(`queue.group.${group}`)} · {items.length}
              </h2>
              <ul className="grid gap-2">
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} locale={locale} onOpen={setSelectedId} />
                ))}
              </ul>
            </section>
          ))
      )}

      {finished.length > 0 ? (
        <section aria-labelledby="finished-heading" className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p id="finished-heading" className="text-muted-foreground text-sm">
              {t('queue.assistant_summary', { count: bySystem })}
              {byFrontDesk > 0 ? ` · ${t('queue.front_desk_summary', { count: byFrontDesk })}` : ''}
            </p>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showFinished}
              onClick={() => setShowFinished((value) => !value)}
            >
              {showFinished ? t('common.hide') : t('common.show')}
            </Button>
          </div>
          {showFinished ? (
            <ul className="grid gap-2">
              {finished.map((task) => (
                <TaskRow key={task.id} task={task} locale={locale} onOpen={setSelectedId} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <CaseSheet
        task={selected}
        open={selected !== undefined}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null)
        }}
        onNext={next}
      />
    </div>
  )
}

function TaskRow({
  task,
  locale,
  onOpen,
}: {
  task: QueuedTaskView
  locale: string
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const lead = leadAppointment(task)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="hover:bg-accent focus-visible:ring-ring flex w-full items-start gap-4 rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="w-16 shrink-0">
          <span className="block font-mono text-sm">
            {lead === undefined ? '' : formatTime(lead.startsAt, locale)}
          </span>
          <span className="text-muted-foreground block text-xs">{lead?.serviceLabel ?? ''}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{task.patient.name}</span>
          <span className="text-muted-foreground block text-sm">{t(todoKey(task))}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <AbsenceTag
              practitionerName={task.absence.practitionerName}
              category={task.absence.category}
            />
            {task.warnings[0] === undefined ? null : (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {t(`warnings.${task.warnings[0].code}`)}
                {task.warnings.length > 1 ? ` +${task.warnings.length - 1}` : ''}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <Badge variant="outline">{t(`tasks.status.${task.status}`)}</Badge>
          {task.patient.phone === null ? null : (
            <span className="text-muted-foreground mt-1 block font-mono text-xs">
              {task.patient.phone}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
