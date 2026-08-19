import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AbsenceCategoryContract } from '@ausfall/contracts'

/** "Anna Weber · krank" — tells the front desk which absence a row belongs to. */
export function AbsenceTag({
  practitionerName,
  category,
  dotClass,
}: {
  practitionerName: string
  category: AbsenceCategoryContract
  dotClass?: string
}) {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" className="font-normal">
      {dotClass === undefined ? null : (
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden="true" />
      )}
      {practitionerName} · {t(`absence.category.${category}`)}
    </Badge>
  )
}
