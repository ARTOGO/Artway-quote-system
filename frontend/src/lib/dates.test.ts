import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDaysISO, todayISO } from './dates';

describe('todayISO', () => {
  it('formats a Date as yyyy-mm-dd with zero-padded month and day', () => {
    const d = new Date(2026, 0, 5); // 2026-01-05 local time
    expect(todayISO(d)).toBe('2026-01-05');
  });

  it('pads single-digit months and days correctly', () => {
    const d = new Date(2026, 8, 1); // 2026-09-01
    expect(todayISO(d)).toBe('2026-09-01');
  });

  it('uses today when no argument given', () => {
    const fixed = new Date(2026, 4, 18); // 2026-05-18
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
    expect(todayISO()).toBe('2026-05-18');
    vi.useRealTimers();
  });
});

describe('addDaysISO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 18)); // 2026-05-18
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds positive days', () => {
    expect(addDaysISO(30)).toBe('2026-06-17');
  });

  it('adds zero days = today', () => {
    expect(addDaysISO(0)).toBe('2026-05-18');
  });

  it('supports negative days (past)', () => {
    expect(addDaysISO(-7)).toBe('2026-05-11');
  });

  it('handles month rollover', () => {
    vi.setSystemTime(new Date(2026, 4, 31)); // 2026-05-31
    expect(addDaysISO(1)).toBe('2026-06-01');
  });

  it('handles year rollover', () => {
    vi.setSystemTime(new Date(2026, 11, 31)); // 2026-12-31
    expect(addDaysISO(1)).toBe('2027-01-01');
  });

  it('does not mutate the base Date', () => {
    const base = new Date(2026, 4, 18);
    addDaysISO(30, base);
    expect(base.getDate()).toBe(18);
    expect(base.getMonth()).toBe(4);
  });
});
