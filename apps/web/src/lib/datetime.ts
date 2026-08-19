/** All display times are Europe/Berlin. All stored instants are UTC. */
export const DISPLAY_TIME_ZONE = 'Europe/Berlin'

type Locale = 'de' | 'en'

const localeTag: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' }

function tag(locale: string): string {
  return localeTag[locale as Locale] ?? localeTag.de
}

function format(value: Date | string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    ...options,
  }).format(date)
}

/** "07.09.2026, 08:00" */
export function formatDateTime(value: Date | string, locale: string): string {
  return format(value, locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "08:00" */
export function formatTime(value: Date | string, locale: string): string {
  return format(value, locale, { hour: '2-digit', minute: '2-digit' })
}

/** "Mo., 07.09.2026" */
export function formatDate(value: Date | string, locale: string): string {
  return format(value, locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "Mo., 07.09.2026, 08:00" */
export function formatDateTimeLong(value: Date | string, locale: string): string {
  return format(value, locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Berlin wall-clock parts of an instant, as a `datetime-local` input value. */
export function toDateTimeLocalValue(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Berlin UTC offset in minutes for a given instant (handles summer time). */
function berlinOffsetMinutes(utcGuess: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(utcGuess)
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

/** Read a `datetime-local` value as Berlin wall-clock and return the UTC instant. */
export function fromDateTimeLocalValue(value: string): Date {
  const guess = new Date(`${value}:00Z`)
  const offset = berlinOffsetMinutes(guess)
  return new Date(guess.getTime() - offset * 60_000)
}

/** End of the Berlin calendar day that contains `value`, as a UTC instant. */
export function endOfBerlinDay(value: Date): Date {
  const day = toDateTimeLocalValue(value).slice(0, 10)
  return fromDateTimeLocalValue(`${day}T23:59`)
}
