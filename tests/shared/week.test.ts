import { describe, it, expect } from 'vitest';
import { mondayOf, addWeeks, dayDate, isValidWeekStart, compareWeeks, localDateString, weekdayName } from '../../src/shared/week';

describe('week utilities (T-2, AC-11)', () => {
  it('mondayOf: a Wednesday, a Sunday (previous Monday) and a Monday', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12'); // Wednesday
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // Sunday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12'); // Monday
  });
  it('works across month and year boundaries', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // Friday
    expect(mondayOf('2026-03-01')).toBe('2026-02-23');
  });
  it('addWeeks moves by whole weeks, also across boundaries and backwards', () => {
    expect(addWeeks('2026-10-12', 1)).toBe('2026-10-19');
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
    expect(addWeeks('2026-10-12', -2)).toBe('2026-09-28');
    expect(addWeeks('2026-10-12', 0)).toBe('2026-10-12');
  });
  it('dayDate(weekStart, 7) is the Sunday', () => {
    expect(dayDate('2026-10-12', 1)).toBe('2026-10-12');
    expect(dayDate('2026-10-12', 3)).toBe('2026-10-14');
    expect(dayDate('2026-10-12', 7)).toBe('2026-10-18');
    expect(dayDate('2026-10-26', 7)).toBe('2026-11-01');
  });
  it('isValidWeekStart rejects non-Mondays and malformed strings', () => {
    expect(isValidWeekStart('2026-10-12')).toBe(true);
    expect(isValidWeekStart('2026-10-13')).toBe(false);
    expect(isValidWeekStart('2026-10-18')).toBe(false);
    expect(isValidWeekStart('12.10.2026')).toBe(false);
    expect(isValidWeekStart('2026-13-01')).toBe(false);
    expect(isValidWeekStart('')).toBe(false);
    expect(isValidWeekStart('2026-02-30')).toBe(false);
  });
  it('compareWeeks orders by date', () => {
    expect(compareWeeks('2026-10-12', '2026-10-19')).toBeLessThan(0);
    expect(compareWeeks('2026-10-19', '2026-10-12')).toBeGreaterThan(0);
    expect(compareWeeks('2026-10-12', '2026-10-12')).toBe(0);
  });
  it('localDateString formats the local calendar date', () => {
    expect(localDateString(new Date(2026, 9, 14, 23, 30))).toBe('2026-10-14');
    expect(localDateString(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
  it('weekdayName gives English names for days 1 to 7', () => {
    expect(weekdayName(1)).toBe('Monday');
    expect(weekdayName(3)).toBe('Wednesday');
    expect(weekdayName(7)).toBe('Sunday');
  });
});
