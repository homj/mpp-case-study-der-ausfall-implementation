import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
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

export function AppHeader() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const now = demoNow()

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <Link to="/absences/new" className="text-lg font-semibold tracking-tight">
          {t('app.title')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
              >
                <span className="font-semibold">{t('app.demo_time_label')}:</span>
                <span>{formatDateTimeLong(now, locale)}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{t('app.demo_time_hint')}</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2">
            <Label htmlFor="locale-switch" className="text-sm font-normal">
              {t('app.language_label')}
            </Label>
            <Select value={locale} onValueChange={(value) => setLocale(value === 'en' ? 'en' : 'de')}>
              <SelectTrigger id="locale-switch" className="w-36" size="sm">
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
        </div>
      </div>
    </header>
  )
}
