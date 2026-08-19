/** "Ausfälle": one card per absence, with progress and a jump into the queue. */
import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAbsences, useTasks } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { toneFill } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong, formatTime } from '@/lib/datetime'

export const Route = createFileRoute('/absences')({ component: AbsencesPage })

function AbsencesPage() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const absences = useAbsences()
  const tasks = useTasks('all')

  if (absences.isPending) return <Skeleton className="h-40 w-full" />
  if (absences.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('app.error_title')}</AlertTitle>
        <AlertDescription>{(absences.error as Error).message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('absence.list.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('absence.list.subtitle')}</p>
      </header>

      {absences.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">{t('absence.list.empty')}</p>
          </CardContent>
        </Card>
      ) : null}

      {absences.data.map((absence) => {
        const own = (tasks.data ?? []).filter((task) => task.absence.id === absence.id)
        const bySystem = own.filter((task) => task.resolvedBy === 'system').length
        const byFrontDesk = own.filter((task) => task.resolvedBy === 'front_desk').length
        const retry = own.filter((task) => task.status === 'retry_contact').length
        const stillOpen = own.filter(
          (task) => task.status === 'open' || task.status === 'in_progress',
        ).length
        const done = bySystem + byFrontDesk
        const percent = absence.taskCount === 0 ? 0 : Math.round((done / absence.taskCount) * 100)

        return (
          <Card key={absence.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <AbsenceTag
                  practitionerName={absence.practitionerName}
                  category={absence.category}
                />
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {formatDateTimeLong(absence.startsAt, locale)} –{' '}
                {formatTime(absence.endsAt, locale)}
                {absence.note === null ? '' : ` · „${absence.note}“`}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div
                className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
                role="img"
                aria-label={t('absence.list.progress_label', { percent })}
              >
                {(
                  [
                    ['assistant', bySystem],
                    ['done', byFrontDesk],
                    ['attention', retry],
                    ['open', stillOpen],
                  ] as const
                ).map(([tone, count]) =>
                  count === 0 || absence.taskCount === 0 ? null : (
                    <span
                      key={tone}
                      className={toneFill[tone]}
                      style={{ width: `${(count / absence.taskCount) * 100}%` }}
                    />
                  ),
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {t('absence.list.legend_assistant', { count: bySystem })} ·{' '}
                {t('absence.list.legend_front_desk', { count: byFrontDesk })} ·{' '}
                {t('absence.list.legend_retry', { count: retry })} ·{' '}
                {t('absence.list.legend_open', { count: stillOpen })} ·{' '}
                {t('absence.list.legend_total', { count: absence.taskCount })}
              </p>
              <div>
                <Button asChild variant={absence.openTaskCount > 0 ? 'default' : 'outline'}>
                  <Link to="/queue" search={{ absence: absence.id }}>
                    {absence.openTaskCount > 0
                      ? t('absence.list.work_open', { count: absence.openTaskCount })
                      : t('absence.list.view_cases')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
