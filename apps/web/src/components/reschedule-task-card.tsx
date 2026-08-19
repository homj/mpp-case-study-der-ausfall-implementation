import { Mail, Phone, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { runQuickAction } from '@/api/client'
import type {
  AffectedAppointmentView,
  DecisionView,
  QuickAction,
  RescheduleTaskView,
  SlotView,
} from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong } from '@/lib/datetime'

function decisionLabelKey(decision: DecisionView): string {
  return `decision.${decision.kind}`
}

export function RescheduleTaskCard({
  absenceId,
  task,
}: {
  absenceId: string
  task: RescheduleTaskView
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [busy, setBusy] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(task.contactAttempts)
  const [failed, setFailed] = useState(false)

  async function act(key: string, action: QuickAction, terminoAppointmentId?: string, slot?: SlotView) {
    setBusy(key)
    setFailed(false)
    try {
      await runQuickAction({ absenceId, taskId: task.id, action, terminoAppointmentId, slot })
      if (action === 'log_contact_attempt') setAttempts((value) => value + 1)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              <span className="text-muted-foreground mr-2 text-sm font-normal">
                {t('tasks.rank', { rank: task.rank })}
              </span>
              {task.patient.name}
            </CardTitle>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {task.patient.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone aria-hidden="true" className="size-3.5" />
                  {task.patient.phone}
                </span>
              ) : null}
              {task.patient.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail aria-hidden="true" className="size-3.5" />
                  {task.patient.email}
                </span>
              ) : (
                <span>{t('tasks.no_email')}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`tasks.status.${task.status}`)}</Badge>
            {!task.patient.reachableByPhone ? (
              <Badge variant="destructive">{t('tasks.unreachable_by_phone')}</Badge>
            ) : null}
            {task.patient.unmatched ? (
              <Badge variant="outline">{t('tasks.unmatched_patient')}</Badge>
            ) : null}
            <Badge variant="outline">{t('tasks.contact_attempts', { count: attempts })}</Badge>
          </div>
        </div>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => act('contact', 'log_contact_attempt')}
          >
            {busy === 'contact' ? t('quick_action.running') : t('tasks.log_contact_attempt')}
          </Button>
          {failed ? (
            <span role="alert" className="text-destructive ml-3 text-sm">
              {t('quick_action.failed')}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-4">
        {task.appointments.map((item, index) => (
          <div key={item.appointment.terminoAppointmentId} className="grid gap-3">
            {index > 0 ? <Separator /> : null}
            <AffectedAppointmentBlock
              item={item}
              locale={locale}
              busy={busy}
              onAct={(key, action, slot) =>
                act(key, action, item.appointment.terminoAppointmentId, slot)
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AffectedAppointmentBlock({
  item,
  locale,
  busy,
  onAct,
}: {
  item: AffectedAppointmentView
  locale: string
  busy: string | null
  onAct: (key: string, action: QuickAction, slot?: SlotView) => void
}) {
  const { t } = useTranslation()
  const { appointment, decision } = item
  const id = appointment.terminoAppointmentId

  const candidates: SlotView[] =
    decision.kind === 'proposal' || decision.kind === 'front_desk'
      ? decision.candidates
      : decision.kind === 'swap_proposal' || decision.kind === 'auto_rebook'
        ? [decision.slot]
        : []

  const sameDayImpossible =
    (decision.kind === 'proposal' || decision.kind === 'front_desk') && decision.sameDayImpossible

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">
          {t('appointment.original_time')}: {formatDateTimeLong(appointment.startsAt, locale)}
        </span>
        <span className="text-muted-foreground text-sm">
          {appointment.serviceCode ?? appointment.serviceLabel} &middot; {appointment.serviceLabel}{' '}
          &middot; {appointment.locationName} &middot;{' '}
          {t('appointment.duration', { count: appointment.durationMin })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {appointment.inProgress ? <Badge>{t('appointment.in_progress')}</Badge> : null}
        {appointment.imminent ? <Badge variant="destructive">{t('appointment.imminent')}</Badge> : null}
        {item.duplicateSameDay ? (
          <Badge variant="outline">{t('appointment.duplicate_same_day')}</Badge>
        ) : null}
        {item.warnings.map((warning) => (
          <Tooltip key={warning.code}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="border-amber-500 text-amber-900 dark:text-amber-100">
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                {t(`warnings.${warning.code}`)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{warning.detail}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          {t('decision.heading')}
        </span>
        <span>{t(decisionLabelKey(decision))}</span>
        {decision.kind === 'front_desk' ? (
          <span className="text-muted-foreground text-sm">
            {t(`decision.reason.${decision.reason}`)}
          </span>
        ) : null}
        {sameDayImpossible ? (
          <span className="text-destructive text-sm font-medium">
            {t('appointment.same_day_impossible')}
          </span>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <div className="grid gap-2">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            {t('decision.candidates_heading')}
          </span>
          <ul className="grid gap-2">
            {candidates.map((slot) => (
              <li
                key={`${slot.terminoPractitionerId}-${slot.startsAt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2"
              >
                <span className="text-sm">
                  {t('decision.candidate_summary', {
                    time: formatDateTimeLong(slot.startsAt, locale),
                    practitioner: slot.practitionerName,
                    location: slot.locationName,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => onAct(`${id}-accept-${slot.startsAt}`, 'accept_proposal', slot)}
                >
                  {busy === `${id}-accept-${slot.startsAt}`
                    ? t('quick_action.running')
                    : t('quick_action.accept_proposal')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('decision.no_candidates')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy !== null}
          onClick={() => onAct(`${id}-cancel`, 'cancel_and_notify')}
        >
          {busy === `${id}-cancel` ? t('quick_action.running') : t('quick_action.cancel_and_notify')}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button type="button" variant="outline" size="sm" disabled>
                {t('quick_action.rebooked_manually')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t('quick_action.rebooked_manually_tooltip')}</TooltipContent>
        </Tooltip>
      </div>

    </div>
  )
}
