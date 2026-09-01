/**
 * Public surface — platform/time.
 *
 * Authority: ADR-0003 §Decision 5 — "A `Clock` abstraction supplies 'now'. Domain code never
 * calls `Date.now()` directly. The demo runs against a fixed as-of date so the portfolio
 * narrative is stable and reproducible (REQ-DATA-007, AC-7)."
 *
 * The `G-CLOCK` source gate (architecture/manifest.json) fails the build on any ambient
 * time access in `src/contexts` or `src/app`. This module is the sole exemption.
 *
 * **Phase 2 closed DR-011.** Period arithmetic is implemented; the fiscal calendar is supplied
 * as data rather than assumed, so OQ-5 remains genuinely open without blocking anything.
 */

/** ISO-8601 instant in UTC. Branded so a bare string cannot be passed as a timestamp. */
export type Instant = string & { readonly __instantBrand: unique symbol };

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;

export function instant(value: string): Instant {
  if (!INSTANT_RE.test(value)) {
    throw new TypeError(`Not a UTC ISO-8601 instant: "${value}".`);
  }
  return value as Instant;
}

export function weekId(value: string): WeekId {
  if (!WEEK_RE.test(value)) {
    throw new TypeError(`Not an ISO week identifier (YYYY-Www): "${value}".`);
  }
  return value as WeekId;
}

export function calendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new TypeError(`Not a valid calendar date (YYYY-MM-DD): "${value}".`);
  }
  return value;
}

/** The calendar date portion of an instant, in UTC. */
export function dateOf(i: Instant): CalendarDate {
  return i.slice(0, 10) as CalendarDate;
}

/** The only legitimate source of "now" anywhere below the platform layer. */
/**
 * Instant arithmetic.
 *
 * These exist so that no code outside this module has to touch `Date`. The G-CLOCK gate bans the
 * global everywhere else, and it should: the difference between "the time this request was issued"
 * and "the time right now" is invisible at the call site and is exactly how a session lifetime, a
 * rate-limit window or a freshness calculation quietly starts measuring the wrong thing. Passing an
 * `Instant` in and getting one out makes the origin explicit in the signature.
 */
export function instantPlusMs(from: Instant, ms: number): Instant {
  return new Date(Date.parse(from) + ms).toISOString() as Instant;
}

/** Milliseconds from `from` to `to`. Negative when `to` precedes `from`. */
export function msBetween(from: Instant, to: Instant): number {
  return Date.parse(to) - Date.parse(from);
}

/** Whole days from `from` to `to`, floored. Distinct from the `CalendarDate` version below. */
export function daysBetweenInstants(from: Instant, to: Instant): number {
  return Math.floor(msBetween(from, to) / 86_400_000);
}

/** Earlier of two instants. ISO-8601 UTC strings sort lexicographically, so this is exact. */
export function earlier(a: Instant, b: Instant): Instant {
  return a <= b ? a : b;
}

export interface Clock {
  now(): Instant;
}

/**
 * Deterministic clock. Every test and the demo itself run on this so that golden fixtures
 * and the synthetic narrative are reproducible (AC-7).
 */
export class FixedClock implements Clock {
  constructor(private readonly fixed: Instant) {}
  now(): Instant {
    return this.fixed;
  }
}

/**
 * Ambient system clock. Permitted only here; the source gate rejects it everywhere else.
 * Runtime composition injects this; the demo injects `FixedClock`.
 */
export class SystemClock implements Clock {
  now(): Instant {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') as Instant;
  }
}

export {
  type CalendarDate,
  type WeekId,
  type ReportingPeriodId,
  type FiscalPeriodId,
  type FiscalPeriodKind,
  type FiscalCalendarDefinition,
  type ProjectPeriodNumber,
  PeriodError,
  isCalendarDate,
  toEpochDay,
  fromEpochDay,
  addDays,
  daysBetween,
  hasOccurredAsOf,
  isOpenAsOf,
  settledOnAsOf,
  compareDates,
  startOfWeek,
  startOfWeekId,
  weekOf,
  weeksBetween,
  addWeeks,
  trailingWeeks,
  fiscalYearOf,
  fiscalMonthOf,
  fiscalPeriodOf,
  projectPeriodOf,
} from './periods.js';

import { type CalendarDate, type WeekId, isCalendarDate } from './periods.js';
