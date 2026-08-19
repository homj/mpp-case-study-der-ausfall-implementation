import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { USE_MOCK, getAbsenceView } from '@/api/client'
import { AutomatedActions } from '@/components/automated-actions'
import { DataIssuesPanel } from '@/components/data-issues-panel'
import { OutboxPanel } from '@/components/outbox-panel'
import { RescheduleTaskCard } from '@/components/reschedule-task-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong } from '@/lib/datetime'

export const Route = createFileRoute('/absences/$id')({
  loader: ({ params }) => getAbsenceView(params.id),
  component: AbsenceDetailPage,
  pendingComponent: PendingState,
  errorComponent: ErrorState,
})

function PendingState() {
  const { t } = useTranslation()
  return <p className="text-muted-foreground">{t('app.loading')}</p>
}

function ErrorState() {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{t('app.error_title')}</AlertDescription>
    </Alert>
  )
}

function AbsenceDetailPage() {
  const absence = Route.useLoaderData()
  const { t } = useTranslation()
  const { locale } = useLocale()

  return (
    <div className="grid gap-6">
      {USE_MOCK ? (
        <Alert>
          <AlertDescription>{t('app.mock_data_notice')}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {t('absence.detail.heading')}: {absence.practitionerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t('absence.detail.period')}
            </span>
            <span>
              {formatDateTimeLong(absence.startsAt, locale)} &ndash;{' '}
              {formatDateTimeLong(absence.endsAt, locale)}
            </span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t('absence.detail.category')}
            </span>
            <span>
              <Badge variant="secondary">{t(`absence.category.${absence.category}`)}</Badge>
            </span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t('absence.detail.note')}
            </span>
            <span>{absence.note ?? t('absence.detail.no_note')}</span>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="tasks-heading" className="grid gap-3">
        <div>
          <h2 id="tasks-heading" className="text-lg font-semibold">
            {t('tasks.heading')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('tasks.description')}</p>
        </div>
        {absence.tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('tasks.empty')}</p>
        ) : (
          absence.tasks
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((task) => (
              <RescheduleTaskCard key={task.id} absenceId={absence.id} task={task} />
            ))
        )}
      </section>

      <AutomatedActions absenceId={absence.id} actions={absence.automatedActions} />

      <OutboxPanel
        terminoWrites={absence.terminoWrites}
        notifications={absence.notifications}
      />

      <DataIssuesPanel issues={absence.dataIssues} />
    </div>
  )
}
