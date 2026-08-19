/**
 * One case, opened from the queue. Order follows the prototype: phone first,
 * then what and why, the call script, the assistant's proposals, and last the
 * outcome buttons. Every outcome calls a quick action and refetches.
 */
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Phone } from 'lucide-react'
import { api } from '@/api/client'
import { useInvalidateAll } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong, formatTime } from '@/lib/datetime'
import { leadAppointment, openAppointments, todoKey } from '@/lib/queue'
import type { QueuedTaskView, SlotView } from '@ausfall/contracts'

function slotLabel(slot: SlotView, locale: string): string {
  return `${formatDateTimeLong(slot.startsAt, locale)} · ${slot.practitionerName} · ${slot.locationName}`
}

export function CaseSheet({
  task,
  open,
  onOpenChange,
  onNext,
}: {
  task: QueuedTaskView | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const invalidate = useInvalidateAll()

  const lead = task === undefined ? undefined : leadAppointment(task)
  const stillOpen = task === undefined ? [] : openAppointments(task)

  const act = useMutation({
    mutationFn: async (action: {
      kind: 'reached' | 'not_reached' | 'kept' | 'cancel' | 'accept'
      slotIndex?: number
    }) => {
      if (task === undefined) return
      if (action.kind === 'reached') await api.logContactAttempt(task.absence.id, task.id, true)
      if (action.kind === 'not_reached') await api.logContactAttempt(task.absence.id, task.id, false)
      if (action.kind === 'kept') await api.markKept(task.absence.id, task.id)
      if (action.kind === 'cancel') {
        for (const item of stillOpen) await api.cancelAppointment(item.id)
      }
      if (action.kind === 'accept' && lead !== undefined) {
        await api.acceptProposal(lead.id, action.slotIndex ?? 0)
      }
    },
    onSuccess: (_data, action) => {
      invalidate()
      const name = task?.patient.name ?? ''
      toast.success(t(`queue.toast.${action.kind}`, { name }))
      if (action.kind !== 'reached') onNext()
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const candidates = lead?.decision.candidates ?? []
  const scriptKey =
    lead === undefined
      ? 'queue.script.walk_in'
      : candidates.length > 0
        ? 'queue.script.proposal'
        : lead.decision.kind === 'front_desk' && lead.decision.reason === 'in_progress'
          ? 'queue.script.walk_in'
          : lead.imminent
            ? 'queue.script.walk_in'
            : 'queue.script.no_slot'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {task === undefined ? null : (
          <>
            <SheetHeader>
              <SheetTitle>{task.patient.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <AbsenceTag
                    practitionerName={task.absence.practitionerName}
                    category={task.absence.category}
                  />
                  <Badge variant="outline">{t(`tasks.status.${task.status}`)}</Badge>
                  {task.contactAttempts > 0 ? (
                    <Badge variant="outline">
                      {t('queue.attempts', { count: task.contactAttempts })}
                    </Badge>
                  ) : null}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 px-4 pb-4">
              <div>
                {task.patient.phone === null ? (
                  <Badge variant="outline">{t('queue.no_phone')}</Badge>
                ) : (
                  <a
                    href={`tel:${task.patient.phone.replace(/\s/g, '')}`}
                    className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
                  >
                    <Phone className="size-5" aria-hidden="true" />
                    {task.patient.phone}
                  </a>
                )}
                <p className="text-muted-foreground text-sm">
                  {task.patient.email ?? t('queue.no_email')}
                </p>
              </div>

              <Separator />

              <div className="grid gap-1">
                <p className="font-medium">{t(todoKey(task))}</p>
                {lead === undefined ? null : (
                  <p className="text-muted-foreground text-sm">
                    {formatDateTimeLong(lead.startsAt, locale)} · {lead.serviceLabel} ·{' '}
                    {lead.locationName}
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
                    <li key={`${warning.code}-${index}`} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{t(`warnings.${warning.code}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <section aria-labelledby="script-heading" className="bg-muted rounded-md p-3">
                <h3 id="script-heading" className="text-xs font-semibold tracking-wide uppercase">
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
                <section aria-labelledby="proposals-heading" className="grid gap-2">
                  <h3 id="proposals-heading" className="text-sm font-semibold">
                    {t('queue.proposals_label')}
                  </h3>
                  <p className="text-muted-foreground text-xs">{t('queue.proposals_hint')}</p>
                  {candidates.map((slot, index) => (
                    <Button
                      key={`${slot.startsAt}-${slot.terminoPractitionerId}`}
                      variant="outline"
                      className="h-auto justify-start py-2 text-left whitespace-normal"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: 'accept', slotIndex: index })}
                    >
                      <span>
                        {slotLabel(slot, locale)}
                        {lead !== undefined && slot.terminoLocationId !== lead.terminoLocationId ? (
                          <span className="block text-xs font-normal">
                            {t('queue.other_location')}
                          </span>
                        ) : null}
                      </span>
                    </Button>
                  ))}
                </section>
              ) : null}
            </div>

            <SheetFooter className="grid grid-cols-2 gap-2">
              <Button
                disabled={act.isPending || task.status === 'resolved'}
                onClick={() => act.mutate({ kind: 'reached' })}
              >
                {t('queue.action.reached')}
              </Button>
              <Button
                variant="outline"
                disabled={act.isPending || task.status === 'resolved'}
                onClick={() => act.mutate({ kind: 'not_reached' })}
              >
                {t('queue.action.not_reached')}
              </Button>
              <Button
                variant="outline"
                disabled={act.isPending || task.status === 'resolved'}
                onClick={() => act.mutate({ kind: 'kept' })}
              >
                {t('queue.action.kept')}
              </Button>
              <Button
                variant="destructive"
                disabled={act.isPending || stillOpen.length === 0}
                onClick={() => act.mutate({ kind: 'cancel' })}
              >
                {t('queue.action.cancel')}
              </Button>
              <Button variant="ghost" className="col-span-2" onClick={onNext}>
                {t('queue.action.next')}
                <ArrowRight aria-hidden="true" />
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
