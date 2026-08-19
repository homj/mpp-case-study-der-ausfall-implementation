import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DataIssueView } from '@/api/types'
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

export function DataIssuesPanel({ issues }: { issues: DataIssueView[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<DataIssueView | null>(null)

  function fieldLabels(fields: string[]): string {
    return fields.map((field) => t(`data_issues.field.${field}`, { defaultValue: field })).join(', ')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('data_issues.heading')}</CardTitle>
        <CardDescription>{t('data_issues.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {issues.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('data_issues.empty')}</p>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t(`data_issues.kind.${issue.kind}`)}</Badge>
                  <span className="font-medium">{issue.subject}</span>
                </div>
                <p className="text-muted-foreground text-sm">{issue.detail}</p>
                {issue.candidates.length > 0 ? (
                  <div className="mt-1 grid gap-1">
                    <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                      {t('data_issues.candidates_heading')}
                    </span>
                    <ul className="grid gap-1">
                      {issue.candidates.map((candidate) => (
                        <li key={candidate.patientId} className="text-sm">
                          <span className="font-medium">{candidate.name}</span>{' '}
                          <span className="text-muted-foreground">
                            &middot; {t('data_issues.birth_date', { date: candidate.birthDate })}{' '}
                            &middot;{' '}
                            {t('data_issues.matched_fields', {
                              fields: fieldLabels(candidate.matchedFields),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(issue)}>
                {t('data_issues.resolve')}
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open !== null} onOpenChange={(next) => (next ? undefined : setOpen(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('data_issues.dialog.title')}</DialogTitle>
            <DialogDescription>{t('data_issues.dialog.description')}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">{t('data_issues.dialog.placeholder')}</p>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(null)}>
              {t('data_issues.dialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
