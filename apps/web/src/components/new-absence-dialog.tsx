/**
 * Flow 1: record an absence, let the assistant run, then decide whether to work
 * the urgent cases right away or leave them in the queue.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus } from 'lucide-react'
import { api } from '@/api/client'
import { useInvalidateAll, usePractitioners } from '@/api/queries'
import { AbsenceTag } from '@/components/absence-tag'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLocale } from '@/i18n/use-locale'
import {
  endOfBerlinDay,
  formatTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/lib/datetime'
import { demoNow } from '@/lib/demo-now'
import { isUrgent, leadAppointment, todoKey } from '@/lib/queue'
import type { AbsenceCategoryContract, CreateAbsenceResponse, QueuedTaskView } from '@ausfall/contracts'

const CATEGORIES: AbsenceCategoryContract[] = ['sick', 'emergency', 'planned', 'other']

export function NewAbsenceDialog() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const invalidate = useInvalidateAll()
  const practitioners = usePractitioners()

  const [open, setOpen] = useState(false)
  const [practitionerId, setPractitionerId] = useState('')
  const [category, setCategory] = useState<AbsenceCategoryContract>('emergency')
  const [from, setFrom] = useState(() => toDateTimeLocalValue(demoNow()))
  const [to, setTo] = useState(() => toDateTimeLocalValue(endOfBerlinDay(demoNow())))
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{ response: CreateAbsenceResponse; urgent: QueuedTaskView[] } | null>(
    null,
  )

  const create = useMutation({
    mutationFn: async () => {
      const response = await api.createAbsence({
        practitionerId,
        category,
        startsAt: fromDateTimeLocalValue(from).toISOString(),
        endsAt: fromDateTimeLocalValue(to).toISOString(),
        note: note.trim() === '' ? null : note.trim(),
      })
      const tasks = await api.listTasks('open')
      return {
        response,
        urgent: tasks.filter((task) => task.absence.id === response.absenceId && isUrgent(task)),
      }
    },
    onSuccess: (value) => {
      setResult(value)
      invalidate()
    },
  })

  function reset() {
    setResult(null)
    create.reset()
  }

  function close() {
    setOpen(false)
    reset()
  }

  function workNow() {
    const absenceId = result?.response.absenceId
    close()
    void navigate({ to: '/queue', search: absenceId === undefined ? {} : { absence: absenceId } })
  }

  const selected = practitioners.data?.find((item) => item.id === practitionerId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {t('absence.new.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {result === null ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('absence.new.title')}</DialogTitle>
              <DialogDescription>{t('absence.new.reassurance')}</DialogDescription>
            </DialogHeader>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (practitionerId !== '') create.mutate()
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="practitioner">{t('absence.new.practitioner')}</Label>
                <Select value={practitionerId} onValueChange={setPractitionerId}>
                  <SelectTrigger id="practitioner">
                    <SelectValue placeholder={t('absence.new.practitioner_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(practitioners.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.firstName} {item.lastName} ({item.qualifications.join(', ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category">{t('absence.new.category')}</Label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as AbsenceCategoryContract)}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`absence.category_long.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="from">{t('absence.new.from')}</Label>
                  <Input
                    id="from"
                    type="datetime-local"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="to">{t('absence.new.to')}</Label>
                  <Input
                    id="to"
                    type="datetime-local"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="note">{t('absence.new.note')}</Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('absence.new.note_placeholder')}
                />
              </div>

              <Alert>
                <AlertTitle>{t('absence.new.info_title')}</AlertTitle>
                <AlertDescription>{t('absence.new.info_body')}</AlertDescription>
              </Alert>

              {create.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t('app.error_title')}</AlertTitle>
                  <AlertDescription>{(create.error as Error).message}</AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={practitionerId === '' || create.isPending}>
                  {create.isPending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      {t('absence.new.running')}
                    </>
                  ) : (
                    t('absence.new.submit')
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('absence.new.result_title')}</DialogTitle>
              <DialogDescription>
                {selected === undefined ? null : (
                  <AbsenceTag
                    practitionerName={`${selected.firstName} ${selected.lastName}`}
                    category={category}
                  />
                )}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-3">
                <dd className="text-2xl font-semibold">
                  {result.response.counts.tasksResolvedBySystem}
                </dd>
                <dt className="text-muted-foreground text-xs">{t('absence.new.count_auto')}</dt>
              </div>
              <div className="rounded-md border p-3">
                <dd className="text-2xl font-semibold">
                  {result.response.counts.tasks - result.response.counts.tasksResolvedBySystem}
                </dd>
                <dt className="text-muted-foreground text-xs">{t('absence.new.count_front_desk')}</dt>
              </div>
              <div className="border-destructive/50 rounded-md border p-3">
                <dd className="text-2xl font-semibold">{result.urgent.length}</dd>
                <dt className="text-muted-foreground text-xs">{t('absence.new.count_urgent')}</dt>
              </div>
            </dl>

            {result.urgent.length > 0 ? (
              <section aria-labelledby="urgent-heading" className="grid gap-2">
                <h3 id="urgent-heading" className="text-sm font-semibold">
                  {t('absence.new.urgent_heading')}
                </h3>
                <ul className="grid gap-1 text-sm">
                  {result.urgent.map((task) => {
                    const lead = leadAppointment(task)
                    return (
                      <li key={task.id} className="flex gap-2">
                        <span className="font-mono">
                          {lead === undefined ? '' : formatTime(lead.startsAt, locale)}
                        </span>
                        <span className="font-medium">{task.patient.name}</span>
                        <span className="text-muted-foreground">{t(todoKey(task))}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                {t('absence.new.to_queue')}
              </Button>
              <Button onClick={workNow}>
                {result.urgent.length > 0
                  ? t('absence.new.work_urgent')
                  : t('absence.new.work_cases')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
