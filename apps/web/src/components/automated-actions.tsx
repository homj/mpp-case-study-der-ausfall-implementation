import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { undoAutomatedAction } from '@/api/client'
import type { AutomatedActionView, UndoNextStep, UndoReason } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong } from '@/lib/datetime'

const UNDO_REASONS: UndoReason[] = [
  'patient_declined',
  'practitioner_available',
  'wrong_slot',
  'other',
]

const UNDO_NEXT_STEPS: UndoNextStep[] = [
  'front_desk_will_call',
  'takes_place_as_planned',
  'cancel_without_replacement',
]

export function AutomatedActions({
  absenceId,
  actions,
}: {
  absenceId: string
  actions: AutomatedActionView[]
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [open, setOpen] = useState<AutomatedActionView | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('automated.heading')}</CardTitle>
        <CardDescription>{t('automated.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {actions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('automated.empty')}</p>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="grid gap-1">
                <span className="font-medium">{action.patientName}</span>
                <span className="text-muted-foreground text-sm">
                  {t('automated.old_slot')}: {formatDateTimeLong(action.from.startsAt, locale)} (
                  {action.from.practitionerName}, {action.from.locationName}) &rarr;{' '}
                  {t('automated.new_slot')}: {formatDateTimeLong(action.to.startsAt, locale)} (
                  {action.to.locationName})
                </span>
                <span className="text-muted-foreground text-sm">
                  {t('automated.new_practitioner')}: {action.to.practitionerName}
                </span>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant={action.notificationSent ? 'secondary' : 'outline'}>
                    {action.notificationSent
                      ? t('automated.notification_sent')
                      : t('automated.notification_not_sent')}
                  </Badge>
                  {action.undone ? <Badge variant="outline">{t('automated.undone')}</Badge> : null}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={action.undone}
                onClick={() => setOpen(action)}
              >
                {t('automated.undo')}
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <UndoDialog
        absenceId={absenceId}
        action={open}
        onClose={() => setOpen(null)}
      />
    </Card>
  )
}

function UndoDialog({
  absenceId,
  action,
  onClose,
}: {
  absenceId: string
  action: AutomatedActionView | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<UndoReason>('patient_declined')
  const [nextStep, setNextStep] = useState<UndoNextStep>('front_desk_will_call')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const patient = action?.patientName ?? ''
  const defaultMessage = t('automated.undo_dialog.default_message', { patient })
  const value = touched ? message : defaultMessage

  function close() {
    setTouched(false)
    setMessage('')
    setBusy(false)
    onClose()
  }

  async function confirm() {
    if (!action) return
    setBusy(true)
    try {
      await undoAutomatedAction({
        absenceId,
        actionId: action.id,
        reason,
        nextStep,
        message: value,
      })
    } finally {
      close()
    }
  }

  return (
    <Dialog open={action !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('automated.undo_dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('automated.undo_dialog.description', { patient })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="undo-reason">{t('automated.undo_dialog.reason_label')}</Label>
            <Select value={reason} onValueChange={(next) => setReason(next as UndoReason)}>
              <SelectTrigger id="undo-reason" className="w-full">
                <SelectValue placeholder={t('automated.undo_dialog.reason_placeholder')}>
                  {t(`automated.undo_reason.${reason}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNDO_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`automated.undo_reason.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="undo-next-step">{t('automated.undo_dialog.next_step_label')}</Label>
            <Select value={nextStep} onValueChange={(next) => setNextStep(next as UndoNextStep)}>
              <SelectTrigger id="undo-next-step" className="w-full">
                <SelectValue placeholder={t('automated.undo_dialog.next_step_placeholder')}>
                  {t(`automated.undo_next_step.${nextStep}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNDO_NEXT_STEPS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`automated.undo_next_step.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="undo-message">{t('automated.undo_dialog.message_label')}</Label>
            <Textarea
              id="undo-message"
              rows={4}
              value={value}
              aria-describedby="undo-message-hint"
              onChange={(event) => {
                setTouched(true)
                setMessage(event.target.value)
              }}
            />
            <p id="undo-message-hint" className="text-muted-foreground text-sm">
              {t('automated.undo_dialog.message_hint')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {t('automated.undo_dialog.cancel')}
          </Button>
          <Button type="button" onClick={confirm} disabled={busy}>
            {busy ? t('quick_action.running') : t('automated.undo_dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
