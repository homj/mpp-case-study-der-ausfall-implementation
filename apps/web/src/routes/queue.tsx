/**
 * Flow 2: "Offene Fälle" — one queue across every absence, grouped by time of
 * day. On a wide screen the case opens in an inline pane beside the list, so
 * the header, the filters, and the list stay usable. Below `lg` it opens in a
 * sheet. The selected case lives in the URL, so it survives a resize or reload.
 */
import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { useTasks } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { CaseDetailActions, CaseDetailBody, CaseDetailHeader } from '@/components/case-detail'
import { StatusBadge, absenceDotClass, toneClass } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocale } from '@/i18n/use-locale'
import { formatTime } from '@/lib/datetime'
import { DAY_GROUPS, groupOf, leadAppointment, todoKey } from '@/lib/queue'
import type { DayGroup } from '@/lib/queue'
import { cn } from '@/lib/utils'
import type { QueuedTaskView } from '@ausfall/contracts'

type QueueSearch = { absence?: string; task?: string; finished?: boolean }

export const Route = createFileRoute('/queue')({
  validateSearch: (search: Record<string, unknown>): QueueSearch => ({
    absence: typeof search.absence === 'string' ? search.absence : undefined,
    task: typeof search.task === 'string' ? search.task : undefined,
    finished: search.finished === true || search.finished === 'true' ? true : undefined,
  }),
  component: QueuePage,
})

function QueuePage() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const all = useTasks('all')

  const tasks = useMemo(() => all.data ?? [], [all.data])
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

  const selected = filtered.find((task) => task.id === search.task)

  function select(taskId: string | undefined) {
    void navigate({ search: (prev) => ({ ...prev, task: taskId }) })
  }

  function next() {
    const remaining = openTasks.filter((task) => task.id !== search.task)
    select(remaining[0]?.id)
  }

  function setFilter(absenceId: string | undefined) {
    void navigate({ search: (prev) => ({ ...prev, absence: absenceId, task: undefined }) })
  }

  function toggleFinished() {
    void navigate({
      search: (prev) => ({ ...prev, finished: prev.finished === true ? undefined : true }),
    })
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

  const list = (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('queue.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {openTasks.length === 0
            ? t('queue.all_done')
            : t('queue.subtitle', { count: openTasks.length })}
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('queue.filter_label')}>
        <Button
          size="sm"
          variant={search.absence === undefined ? 'default' : 'outline'}
          aria-pressed={search.absence === undefined}
          onClick={() => setFilter(undefined)}
        >
          {t('queue.filter_all')}
          <Badge
            variant="outline"
            className={openTasks.length > 0 ? toneClass.open : toneClass.done}
          >
            {tasks.filter((task) => task.status !== 'resolved').length}
          </Badge>
        </Button>
        {absences.map((absence, index) => (
          <Button
            key={absence.id}
            size="sm"
            variant={search.absence === absence.id ? 'default' : 'outline'}
            aria-pressed={search.absence === absence.id}
            onClick={() => setFilter(absence.id)}
          >
            <span
              className={cn('size-2 rounded-full', absenceDotClass(index))}
              aria-hidden="true"
            />
            {absence.practitionerName}
            <Badge
              variant="outline"
              className={absence.count > 0 ? toneClass.open : toneClass.done}
            >
              {absence.count}
            </Badge>
          </Button>
        ))}
      </div>

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
                  <TaskRow
                    key={task.id}
                    task={task}
                    locale={locale}
                    selected={task.id === search.task}
                    absenceIndex={absences.findIndex((item) => item.id === task.absence.id)}
                    onOpen={select}
                  />
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
              aria-expanded={search.finished === true}
              onClick={toggleFinished}
            >
              {search.finished === true ? t('common.hide') : t('common.show')}
            </Button>
          </div>
          {search.finished === true ? (
            <ul className="grid gap-2">
              {finished.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  locale={locale}
                  selected={task.id === search.task}
                  absenceIndex={absences.findIndex((item) => item.id === task.absence.id)}
                  onOpen={select}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      <div className="min-w-0 flex-1">{list}</div>

      {/* Wide screens: the case sits beside the list and blocks nothing. */}
      <aside className="hidden w-[26rem] shrink-0 lg:block" aria-label={t('queue.detail_label')}>
        {selected === undefined ? (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-sm">
              {t('queue.detail_empty')}
            </CardContent>
          </Card>
        ) : (
          <Card className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <CardHeader>
              <CardTitle>{selected.patient.name}</CardTitle>
              <CaseDetailHeader task={selected} />
            </CardHeader>
            <CardContent className="grid gap-4">
              <CaseDetailBody task={selected} />
              <CaseDetailActions task={selected} onNext={next} />
            </CardContent>
          </Card>
        )}
      </aside>

      {/* Narrow screens: the same case as a sheet. */}
      <Sheet
        open={selected !== undefined}
        onOpenChange={(next) => {
          if (!next) select(undefined)
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md lg:hidden">
          {selected === undefined ? null : (
            <>
              <SheetHeader>
                <SheetTitle>{selected.patient.name}</SheetTitle>
                <SheetDescription asChild>
                  <div>
                    <CaseDetailHeader task={selected} />
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <CaseDetailBody task={selected} />
              </div>
              <SheetFooter>
                <CaseDetailActions task={selected} onNext={next} />
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function TaskRow({
  task,
  locale,
  selected,
  absenceIndex,
  onOpen,
}: {
  task: QueuedTaskView
  locale: string
  selected: boolean
  absenceIndex: number
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const lead = leadAppointment(task)
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(task.id)}
        className={cn(
          'hover:bg-accent focus-visible:ring-ring flex w-full items-start gap-4 rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:outline-none',
          selected && 'border-primary bg-accent',
        )}
      >
        <span className="w-24 shrink-0">
          <span className="block font-mono text-sm">
            {lead === undefined ? '' : formatTime(lead.startsAt, locale)}
          </span>
          {lead === undefined ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground block truncate text-xs">
                  {lead.serviceCode ?? lead.serviceLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent>{lead.serviceLabel}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{task.patient.name}</span>
          <span className="text-muted-foreground block text-sm">{t(todoKey(task))}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <AbsenceTag
              practitionerName={task.absence.practitionerName}
              category={task.absence.category}
              dotClass={absenceDotClass(absenceIndex)}
            />
            {task.warnings[0] === undefined ? null : (
              <Badge variant="outline" className={cn(toneClass.attention, 'whitespace-normal')}>
                <AlertTriangle className="size-3" aria-hidden="true" />
                {t(`warnings.${task.warnings[0].code}`)}
                {task.warnings.length > 1 ? ` +${task.warnings.length - 1}` : ''}
              </Badge>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <StatusBadge status={task.status} resolvedBy={task.resolvedBy} />
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
