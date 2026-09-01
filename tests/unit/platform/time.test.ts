/**
 * The injected clock — ADR-0003 §Decision 5.
 *
 * "Domain code never calls `Date.now()` directly. The demo runs against a fixed as-of date so
 * the portfolio narrative is stable and reproducible (REQ-DATA-007, AC-7)."
 *
 * The complement to these tests is the `G-CLOCK` source gate, which fails the build on any
 * ambient time access in `src/contexts` or `src/app` — covered in the architecture suite.
 */
import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  SystemClock,
  addWeeks,
  calendarDate,
  daysBetween,
  fiscalPeriodOf,
  instant,
  projectPeriodOf,
  trailingWeeks,
  weekId,
  weekOf,
  weeksBetween,
} from '@platform/time';
import type { CalendarDate, FiscalCalendarDefinition } from '@platform/time';

describe('branded time types reject malformed input', () => {
  it('accepts a UTC ISO-8601 instant', () => {
    expect(instant('2026-08-31T00:00:00Z')).toBe('2026-08-31T00:00:00Z');
  });

  it('rejects a local or offset timestamp', () => {
    expect(() => instant('2026-08-31T00:00:00+02:00')).toThrow(TypeError);
    expect(() => instant('2026-08-31')).toThrow(TypeError);
  });

  it('accepts an ISO week and rejects anything else', () => {
    expect(weekId('2026-W35')).toBe('2026-W35');
    expect(() => weekId('2026-35')).toThrow(TypeError);
  });

  it('accepts a calendar date', () => {
    expect(calendarDate('2026-08-31')).toBe('2026-08-31');
    expect(() => calendarDate('31-08-2026')).toThrow(TypeError);
  });
});

describe('FixedClock is what makes golden fixtures possible (AC-7)', () => {
  it('returns the same instant on every call', () => {
    const clock = new FixedClock(instant('2026-08-31T00:00:00Z'));
    expect(clock.now()).toBe(clock.now());
    expect(clock.now()).toBe('2026-08-31T00:00:00Z');
  });
});

describe('SystemClock exists only at the platform boundary', () => {
  it('produces a valid instant', () => {
    expect(() => instant(new SystemClock().now())).not.toThrow();
  });
});

const d = (v: string) => calendarDate(v);

describe('ISO weeks — the reporting period (ADR-0003 §3)', () => {
  it('resolves a date to its ISO week', () => {
    expect(weekOf(d('2026-08-31'))).toBe('2026-W36');
  });

  it('handles the year boundary, where naive week arithmetic breaks', () => {
    // 2026-01-01 is a Thursday, so it belongs to ISO week 1 of 2026.
    expect(weekOf(d('2026-01-01'))).toBe('2026-W01');
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(weekOf(d('2027-01-01'))).toBe('2026-W53');
  });

  it('counts weeks between identifiers', () => {
    expect(weeksBetween(weekId('2026-W01'), weekId('2026-W09'))).toBe(8);
    expect(addWeeks(weekId('2026-W01'), 8)).toBe('2026-W09');
  });

  it('produces the trailing 8-week window MET-FCST-001 is defined over', () => {
    const w = trailingWeeks(weekId('2026-W36'), 8);
    expect(w).toHaveLength(8);
    expect(w[0]).toBe('2026-W29');
    expect(w[7]).toBe('2026-W36');
  });

  it('spans 78 weeks for the 18 months of history the spec requires', () => {
    expect(trailingWeeks(weekId('2026-W36'), 78)).toHaveLength(78);
  });
});

describe('fiscal periods are resolved against a supplied calendar, never assumed', () => {
  const calendarYear: FiscalCalendarDefinition = {
    id: 'CAL-CALENDAR',
    name: 'Calendar year',
    startMonth: 1,
    yearLabelPrefix: 'FY',
    yearLabelledBy: 'START_YEAR',
  };
  const aprilStart: FiscalCalendarDefinition = {
    id: 'CAL-APR',
    name: 'April start, labelled by end year',
    startMonth: 4,
    yearLabelPrefix: 'FY',
    yearLabelledBy: 'END_YEAR',
  };

  it('places the same date in different quarters under different calendars', () => {
    // This is the whole point of OQ-5 remaining open: the answer changes the label.
    expect(fiscalPeriodOf(d('2026-08-31'), calendarYear, 'QUARTER')).toBe('FY2026-Q3');
    expect(fiscalPeriodOf(d('2026-08-31'), aprilStart, 'QUARTER')).toBe('FY2027-Q2');
  });

  it('resolves months and years', () => {
    expect(fiscalPeriodOf(d('2026-08-31'), calendarYear, 'MONTH')).toBe('FY2026-M08');
    expect(fiscalPeriodOf(d('2026-08-31'), aprilStart, 'MONTH')).toBe('FY2027-M05');
    expect(fiscalPeriodOf(d('2026-08-31'), aprilStart, 'YEAR')).toBe('FY2027');
  });
});

describe('project periods are relative to the project, not the calendar', () => {
  it('numbers periods from the project start week', () => {
    const start = d('2026-01-05');
    expect(projectPeriodOf(start, start)).toBe(1);
    expect(projectPeriodOf(d('2026-01-12'), start)).toBe(2);
  });

  it('refuses a date before the project started rather than returning zero', () => {
    expect(() => projectPeriodOf(d('2025-12-01'), d('2026-01-05'))).toThrow(/precedes project start/);
  });
});

describe('calendar arithmetic is UTC and DST-free', () => {
  it('counts days across a DST boundary without drift', () => {
    expect(daysBetween(d('2026-03-01'), d('2026-04-01'))).toBe(31);
    expect(daysBetween(d('2026-10-01'), d('2026-11-01'))).toBe(31);
  });

  it('rejects an impossible date rather than rolling it over', () => {
    expect(() => calendarDate('2026-02-30')).toThrow(TypeError);
    expect(() => calendarDate('2026-13-01')).toThrow(TypeError);
  });
});
