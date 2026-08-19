/**
 * i18n setup. German is the default and complete locale; English mirrors its keys.
 * Translation files live in `src/i18n/{de,en}.json`.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'

export const SUPPORTED_LOCALES = ['de', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'de'
export const LOCALE_STORAGE_KEY = 'ausfall.locale'

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    // Server and first client render always use the default locale.
    // The stored choice is applied after mount, so hydration stays stable.
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  })
}

export default i18n
