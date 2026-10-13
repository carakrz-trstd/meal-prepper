import { describe, it, expect } from 'vitest';
import { parseDurationMinutes } from './durationParser';

describe('parseDurationMinutes (T-6)', () => {
  it('PT30M = 30', () => expect(parseDurationMinutes('PT30M')).toBe(30));
  it('PT1H15M = 75', () => expect(parseDurationMinutes('PT1H15M')).toBe(75));
  it('P0DT45M = 45', () => expect(parseDurationMinutes('P0DT45M')).toBe(45));
  it('invalid -> null', () => {
    expect(parseDurationMinutes('soon')).toBeNull();
    expect(parseDurationMinutes('')).toBeNull();
    expect(parseDurationMinutes(undefined)).toBeNull();
  });
});
