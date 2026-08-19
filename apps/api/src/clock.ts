/**
 * Application clock. The case study is set on 7 September 2026, so the demo
 * clock is on by default and every request sees the same instant. Set
 * `APP_NOW=system` to follow the real clock.
 */
const DEFAULT_APP_NOW = '2026-09-07T07:40:00+02:00';
const SYSTEM_VALUES = new Set(['system', 'real', 'now']);

function configuredValue(): string {
  const raw = process.env.APP_NOW;
  return raw === undefined || raw.trim() === '' ? DEFAULT_APP_NOW : raw.trim();
}

/** True while the API reports a fixed demo instant instead of the real clock. */
export function isDemoClock(): boolean {
  return !SYSTEM_VALUES.has(configuredValue().toLowerCase());
}

/** Current application time, always UTC inside the system. */
export function now(): Date {
  const value = configuredValue();
  if (SYSTEM_VALUES.has(value.toLowerCase())) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`APP_NOW is not a valid date-time: ${value}`);
  }
  return parsed;
}
