/**
 * One case. The same content serves the inline detail pane on a wide screen and
 * the sheet on a narrow one. Order follows the prototype: phone first, what and
 * why, the call script, the assistant's proposals, then the outcomes.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Phone } from 'lucide-react'
import { api } from '@/api/client'
import { useInvalidateAll } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { StatusBadge, toneClass } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong, formatTime } from '@/lib/datetime'
import { leadAppointment, openAppointments, todoKey } from '@/lib/queue'
import type { QueuedTaskView, SlotView } from '@ausfall/contracts'

function slotLabel(slot: SlotView, locale: string): string {
  return `${formatDateTimeLong(slot.startsAt, locale)} · ${slot.practitionerName} · ${slot.locationName}`
}

export function CaseDetailHeader({ task }: { task: QueuedTaskView }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AbsenceTag
        practitionerName={task.absence.practitionerName}
        category={task.absence.category}
      />
      <StatusBadge status={task.status} resolvedBy={task.resolvedBy} />
      {task.contactAttempts > 0 ? (
        <Badge variant="outline" className={toneClass.attention}>
          {t('queue.attempts', { count: task.contactAttempts })}
        </Badge>
      ) : null}
    </div>
  )
}

export function CaseDetailBody({ task }: { task: QueuedTaskView }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const invalidate = useInvalidateAll()
  const lead = leadAppointment(task)

  const accept = useMutation({
    mutationFn: (slotIndex: number) => {
      if (lead === undefined) throw new Error('No appointment to rebook')
      return api.acceptProposal(lead.id, slotIndex)
    },
    onSuccess: () => {
      invalidate()
      toast.success(t('queue.toast.accept', { name: task.patient.name }))
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const candidates = lead?.decision.candidates ?? []
  const scriptKey =
    lead === undefined
      ? 'queue.script.walk_in'
      : candidates.length > 0
        ? 'queue.script.proposal'
        : lead.imminent || lead.decision.reason === 'in_progress'
          ? 'queue.script.walk_in'
          : 'queue.script.no_slot'

  return (
    <div className="grid gap-4">
      <div>
        {task.patient.phone === null ? (
          <Badge variant="outline" className={toneClass.attention}>
            {t('queue.no_phone')}
          </Badge>
        ) : (
          <a
            href={`tel:${task.patient.phone.replace(/\s/g, '')}`}
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
          >
            <Phone className="size-5" aria-hidden="true" />
            {task.patient.phone}
          </a>
        )}
        <p className="text-muted-foreground text-sm">{task.patient.email ?? t('queue.no_email')}</p>
      </div>

      <Separator />

      <div className="grid gap-1">
        <p className="font-medium">{t(todoKey(task))}</p>
        {lead === undefined ? null : (
          <p className="text-muted-foreground text-sm">
            {formatDateTimeLong(lead.startsAt, locale)} · {lead.serviceLabel} · {lead.locationName}
          </p>
        )}
        {lead !== undefined && lead.decision.reason !== null ? (
          <p className="text-muted-foreground text-sm">
            {t(`queue.reason.${lead.decision.reason}`)}
          </p>
        ) : null}
      </div>

      {task.warnings.length > 0 ? (
        <ul className="grid gap-1">
          {task.warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${index}`}
              className="text-muted-foreground flex items-start gap-1.5 text-xs"
            >
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>{t(`warnings.${warning.code}`)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby={`script-${task.id}`} className="bg-muted rounded-md p-3">
        <h3 id={`script-${task.id}`} className="text-xs font-semibold tracking-wide uppercase">
          {t('queue.script_label')}
        </h3>
        <p className="mt-1 text-sm">
          {t(scriptKey, {
            time: lead === undefined ? '' : formatTime(lead.startsAt, locale),
            practitioner: task.absence.practitionerName,
            service: lead?.serviceLabel ?? '',
          })}
        </p>
      </section>

      {candidates.length > 0 ? (
        <section aria-labelledby={`proposals-${task.id}`} className="grid gap-2">
          <h3 id={`proposals-${task.id}`} className="text-sm font-semibold">
            {t('queue.proposals_label')}
          </h3>
          <p className="text-muted-foreground text-xs">{t('queue.proposals_hint')}</p>
          {candidates.map((slot, index) => {
            const otherLocation =
              lead !== undefined && slot.terminoLocationId !== lead.terminoLocationId
            return (
              <Button
                key={`${slot.startsAt}-${slot.terminoPractitionerId}`}
                variant="outline"
                className={`h-auto justify-start py-2 text-left whitespace-normal ${otherLocation ? toneClass.attention : ''}`}
                disabled={accept.isPending}
                onClick={() => accept.mutate(index)}
              >
                <span>
                  {slotLabel(slot, locale)}
                  {otherLocation ? (
                    <span className="block text-xs font-normal">
                      <AlertTriangle className="mr-1 inline size-3" aria-hidden="true" />
                      {t('queue.other_location')}
                    </span>
                  ) : null}
                </span>
              </Button>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

export function CaseDetailActions({
  task,
  onNext,
}: {
  task: QueuedTaskView
  onNext: () => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const invalidate = useInvalidateAll()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const lead = leadAppointment(task)
  const stillOpen = openAppointments(task)

  const act = useMutation({
    mutationFn: async (kind: 'reached' | 'not_reached' | 'kept' | 'cancel') => {
      if (kind === 'reached') await api.logContactAttempt(task.absence.id, task.id, true)
      if (kind === 'not_reached') await api.logContactAttempt(task.absence.id, task.id, false)
      if (kind === 'kept') await api.markKept(task.absence.id, task.id)
      if (kind === 'cancel') {
        for (const item of stillOpen) await api.cancelAppointment(item.id)
      }
    },
    onSuccess: (_data, kind) => {
      invalidate()
      toast.success(t(`queue.toast.${kind}`, { name: task.patient.name }))
      if (kind !== 'reached') onNext()
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const resolved = task.status === 'resolved'

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={act.isPending || resolved} onClick={() => act.mutate('reached')}>
        {t('queue.action.reached')}
      </Button>
      <Button
        variant="outline"
        disabled={act.isPending || resolved}
        onClick={() => act.mutate('not_reached')}
      >
        {t('queue.action.not_reached')}
      </Button>
      <Button
        variant="outline"
        disabled={act.isPending || resolved}
        onClick={() => act.mutate('kept')}
      >
        {t('queue.action.kept')}
      </Button>

      <Separator className="my-1" />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={act.isPending || stillOpen.length === 0}>
            {t('queue.action.cancel')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('queue.cancel_confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('queue.cancel_confirm.body', {
                name: task.patient.name,
                time: lead === undefined ? '' : formatDateTimeLong(lead.startsAt, locale),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => act.mutate('cancel')}>
              {t('queue.action.cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onNext}>
          {t('queue.action.next')}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
