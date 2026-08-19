import { describe, expect, it } from 'vitest';
import { berlinDateTime, berlinDay, berlinIsoWeek, berlinWeekday, dayOffset } from './time.js';

describe('berlinDay', () => {
  it('reads the Berlin calendar day of a UTC instant', () => {
    expect(berlinDay(new Date('2026-09-07T06:00:00Z'))).toBe('2026-09-07');
  });

  it('rolls over at Berlin midnight, not at UTC midnight', () => {
    // 22:30Z in summer is 00:30 Berlin the next day.
    expect(berlinDay(new Date('2026-09-07T22:30:00Z'))).toBe('2026-09-08');
  });
});

describe('berlinWeekday', () => {
  it('maps a UTC instant to the Berlin weekday key', () => {
    expect(berlinWeekday(new Date('2026-09-07T06:00:00Z'))).toBe('mo');
    expect(berlinWeekday(new Date('2026-09-12T10:00:00Z'))).toBe('sa');
    expect(berlinWeekday(new Date('2026-09-13T10:00:00Z'))).toBe('so');
  });
});

describe('berlinDateTime', () => {
  it('converts Berlin wall clock to a UTC instant in summer time (CEST, +02:00)', () => {
    expect(berlinDateTime('2026-09-07', '08:00').toISOString()).toBe('2026-09-07T06:00:00.000Z');
  });

  it('converts Berlin wall clock to a UTC instant in winter time (CET, +01:00)', () => {
    expect(berlinDateTime('2026-01-12', '08:00').toISOString()).toBe('2026-01-12T07:00:00.000Z');
  });

  it('round-trips with berlinDay', () => {
    expect(berlinDay(berlinDateTime('2026-09-07', '00:00'))).toBe('2026-09-07');
    expect(berlinDay(berlinDateTime('2026-09-07', '23:59'))).toBe('2026-09-07');
  });
});

describe('dayOffset', () => {
  it('counts Berlin calendar days from b to a', () => {
    const a = new Date('2026-09-09T06:00:00Z');
    const b = new Date('2026-09-07T06:00:00Z');
    expect(dayOffset(a, b)).toBe(2);
    expect(dayOffset(b, a)).toBe(-2);
    expect(dayOffset(a, a)).toBe(0);
  });

  it('counts calendar days, not 24-hour spans', () => {
    // 23:00 Berlin on the 7th and 01:00 Berlin on the 8th are two hours apart, one day apart.
    expect(dayOffset(berlinDateTime('2026-09-08', '01:00'), berlinDateTime('2026-09-07', '23:00'))).toBe(1);
  });
});

describe('berlinIsoWeek', () => {
  it('returns the ISO week key of the Berlin day', () => {
    expect(berlinIsoWeek(new Date('2026-09-07T06:00:00Z'))).toBe('2026-W37');
    expect(berlinIsoWeek(new Date('2026-09-13T10:00:00Z'))).toBe('2026-W37');
    expect(berlinIsoWeek(new Date('2026-09-14T10:00:00Z'))).toBe('2026-W38');
  });
});
