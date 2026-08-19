import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { AbsenceCategoryContract } from '@ausfall/contracts'

/** "Anna Weber · krank" — tells the front desk which absence a row belongs to. */
export function AbsenceTag({
  practitionerName,
  category,
}: {
  practitionerName: string
  category: AbsenceCategoryContract
}) {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" className="font-normal">
      {practitionerName} · {t(`absence.category.${category}`)}
    </Badge>
  )
}
