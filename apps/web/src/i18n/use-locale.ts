import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isSupportedLocale } from './index'
import type { SupportedLocale } from './index'

/** Current locale plus a setter that remembers the choice in this browser. */
export function useLocale(): {
  locale: SupportedLocale
  setLocale: (next: SupportedLocale) => void
} {
  const { i18n: instance } = useTranslation()

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isSupportedLocale(stored) && stored !== instance.language) {
      void instance.changeLanguage(stored)
    }
  }, [instance])

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
      void i18n.changeLanguage(next)
    },
    [],
  )

  const locale = isSupportedLocale(instance.language) ? instance.language : DEFAULT_LOCALE
  return { locale, setLocale }
}
