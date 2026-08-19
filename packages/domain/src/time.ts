/**
 * Europe/Berlin time helpers. We store UTC and reason in Berlin wall clock.
 * The conversion uses the platform `Intl` time-zone database, so the package stays dependency free.
 */

import type { Weekday } from './types.js';

const TIME_ZONE = 'Europe/Berlin';

const PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' });

const WEEKDAY_BY_SHORT_NAME: Record<string, Weekday> = {
  Mon: 'mo',
  Tue: 'di',
  Wed: 'mi',
  Thu: 'do',
  Fri: 'fr',
  Sat: 'sa',
  Sun: 'so',
};

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date): WallClock {
  const parts = PARTS_FORMAT.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  // `en-GB` renders midnight as hour 24; normalise it to 0.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset in milliseconds between Berlin wall clock and UTC at the given instant. */
function berlinOffsetMs(instant: Date): number {
  const w = wallClock(instant);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The Berlin calendar day (YYYY-MM-DD) that contains the given UTC instant. */
export function berlinDay(instant: Date): string {
  const w = wallClock(instant);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** The Berlin weekday key ('mo'..'so') of the given UTC instant. */
export function berlinWeekday(instant: Date): Weekday {
  const name = WEEKDAY_FORMAT.format(instant);
  const weekday = WEEKDAY_BY_SHORT_NAME[name];
  if (!weekday) throw new Error(`Unknown weekday name: ${name}`);
  return weekday;
}

/** The UTC instant of a Berlin wall-clock time, e.g. berlinDateTime('2026-09-07', '08:00'). */
export function berlinDateTime(day: string, hhmm: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  if (year === undefined || month === undefined || date === undefined) {
    throw new Error(`Invalid Berlin day: ${day}`);
  }
  if (hour === undefined || minute === undefined) {
    throw new Error(`Invalid Berlin time: ${hhmm}`);
  }
  const asIfUtc = Date.UTC(year, month - 1, date, hour, minute, 0);
  // Two passes settle the offset even when the guess lands on the other side of a DST switch.
  let instant = new Date(asIfUtc - berlinOffsetMs(new Date(asIfUtc)));
  instant = new Date(asIfUtc - berlinOffsetMs(instant));
  return instant;
}

/** Whole Berlin calendar days from `b` to `a`; positive when `a` is the later day. */
export function dayOffset(a: Date, b: Date): number {
  return calendarDayNumber(berlinDay(a)) - calendarDayNumber(berlinDay(b));
}

function calendarDayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1) / 86_400_000;
}

/** The ISO week key (e.g. '2026-W37') of the Berlin day that contains the instant. */
export function berlinIsoWeek(instant: Date): string {
  const [year, month, date] = berlinDay(instant).split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
  // ISO 8601: Thursday of the same week decides the year and the week number.
  const isoWeekday = (utc.getUTCDay() + 6) % 7; // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - isoWeekday + 3);
  const isoYear = utc.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayWeekday + 3);
  const week = 1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${pad2(week)}`;
}

/** Adds whole days to a Berlin calendar day string. */
export function addBerlinDays(day: string, days: number): string {
  const ms = (calendarDayNumber(day) + days) * 86_400_000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Whole days between two Berlin calendar day strings; positive when `a` is the later day. */
export function daysBetweenBerlinDays(a: string, b: string): number {
  return calendarDayNumber(a) - calendarDayNumber(b);
}
