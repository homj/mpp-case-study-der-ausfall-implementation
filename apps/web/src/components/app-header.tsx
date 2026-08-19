import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { api } from '@/api/client'
import { useInvalidateAll } from '@/api/queries'
import { NewAbsenceDialog } from '@/components/new-absence-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong } from '@/lib/datetime'
import { demoNow } from '@/lib/demo-now'

/** The next Termino export of the case study. */
const NEXT_EXPORT = 'termino_export_2026-09-07_0805.json'

export function AppHeader() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const invalidate = useInvalidateAll()
  const now = demoNow()

  const ingest = useMutation({
    mutationFn: () => api.ingestExport(NEXT_EXPORT),
    onSuccess: (result) => {
      invalidate()
      toast.success(t('sync.result', result))
    },
    onError: (error) => toast.error((error as Error).message),
  })

  return (
    <header className="bg-card border-b">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/queue" className="text-lg font-semibold tracking-tight">
            {t('app.title')}
          </Link>
          <nav aria-label={t('app.nav_label')} className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/queue" activeProps={{ 'aria-current': 'page' }}>
                {t('queue.title')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/absences" activeProps={{ 'aria-current': 'page' }}>
                {t('absence.list.title')}
              </Link>
            </Button>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline">
                <span className="font-semibold">{t('app.demo_time_label')}:</span>
                <span>{formatDateTimeLong(now, locale)}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{t('app.demo_time_hint')}</TooltipContent>
          </Tooltip>

          <Button
            variant="outline"
            size="sm"
            disabled={ingest.isPending}
            onClick={() => ingest.mutate()}
          >
            <RefreshCw className={ingest.isPending ? 'animate-spin' : ''} aria-hidden="true" />
            {t('sync.ingest_next')}
          </Button>

          <div className="flex items-center gap-2">
            <Label htmlFor="locale-switch" className="text-sm font-normal">
              {t('app.language_label')}
            </Label>
            <Select
              value={locale}
              onValueChange={(value) => setLocale(value === 'en' ? 'en' : 'de')}
            >
              <SelectTrigger id="locale-switch" className="w-28" size="sm">
                <SelectValue>
                  {locale === 'en' ? t('app.language_en') : t('app.language_de')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">{t('app.language_de')}</SelectItem>
                <SelectItem value="en">{t('app.language_en')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <NewAbsenceDialog />
        </div>
      </div>
    </header>
  )
}
