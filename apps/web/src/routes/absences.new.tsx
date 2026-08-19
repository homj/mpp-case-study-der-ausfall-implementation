import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createAbsence } from '@/api/client'
import { MOCK_PRACTITIONERS } from '@/api/mock'
import type { AbsenceCategory } from '@/api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  endOfBerlinDay,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/lib/datetime'
import { demoNow } from '@/lib/demo-now'

export const Route = createFileRoute('/absences/new')({
  component: NewAbsencePage,
})

const CATEGORIES: AbsenceCategory[] = ['sick', 'emergency', 'planned', 'other']

function NewAbsencePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const defaults = useMemo(() => {
    const now = demoNow()
    return {
      from: toDateTimeLocalValue(now),
      to: toDateTimeLocalValue(endOfBerlinDay(now)),
    }
  }, [])

  const [practitioner, setPractitioner] = useState('')
  const [category, setCategory] = useState<AbsenceCategory>('sick')
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!practitioner) {
      setError(t('absence.new.error_practitioner_required'))
      return
    }
    const startsAt = fromDateTimeLocalValue(from)
    const endsAt = fromDateTimeLocalValue(to)
    if (endsAt <= startsAt) {
      setError(t('absence.new.error_period_invalid'))
      return
    }

    setSubmitting(true)
    try {
      const result = await createAbsence({
        terminoPractitionerId: practitioner,
        category,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        note: note.trim() === '' ? null : note.trim(),
      })
      await navigate({ to: '/absences/$id', params: { id: result.id } })
    } catch {
      setError(t('absence.new.error_submit_failed'))
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('absence.new.title')}</CardTitle>
        <CardDescription>{t('absence.new.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="practitioner">{t('absence.new.practitioner_label')}</Label>
            <Select value={practitioner} onValueChange={setPractitioner}>
              <SelectTrigger id="practitioner" className="w-full">
                <SelectValue placeholder={t('absence.new.practitioner_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {MOCK_PRACTITIONERS.map((option) => (
                  <SelectItem key={option.terminoPractitionerId} value={option.terminoPractitionerId}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">{t('absence.new.category_label')}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as AbsenceCategory)}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder={t('absence.new.category_placeholder')}>
                  {t(`absence.category.${category}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`absence.category.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="from">{t('absence.new.from_label')}</Label>
              <Input
                id="from"
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">{t('absence.new.to_label')}</Label>
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
            <Label htmlFor="note">{t('absence.new.note_label')}</Label>
            <Input
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('absence.new.note_placeholder')}
            />
          </div>

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('absence.new.submitting') : t('absence.new.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
