/** Default simulated "now": Monday 2026-09-07, 07:40 Berlin time. */
export const DEFAULT_DEMO_NOW = '2026-09-07T07:40:00+02:00'

/**
 * The demo runs against a frozen clock so the case study stays reproducible.
 * Never use this as a real clock.
 */
export function demoNow(): Date {
  const raw = import.meta.env.VITE_APP_NOW ?? DEFAULT_DEMO_NOW
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_DEMO_NOW) : parsed
}
