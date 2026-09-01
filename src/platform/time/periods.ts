/**
 * Calendar, fiscal, reporting and project periods — four different things.
 *
 * Authority: Phase 2 brief ("Support calendar date, fiscal period, reporting period, and project
 * period separately"); ADR-0003 §Decision 3 (weekly snapshot cadence).
 *
 * **This is what unblocks DR-011.** Phase 1 deliberately stubbed period arithmetic because
 * implementing it would have committed the product to calendar quarters — OQ-5's *assumed* answer.
 * The resolution is not to answer OQ-5 but to stop needing it answered at build time: a
 * `FiscalCalendarDefinition` is data, supplied by the caller. Calendar quarters become one possible
 * configuration rather than a hard-coded truth.
 *
 * The four axes and why conflating them is a defect:
 *
 * | Axis | Question it answers | Owner of the definition |
 * | --- | --- | --- |
 * | Calendar | "What day was it?" | Universal |
 * | Fiscal | "Which financial quarter does this fall in?" | `organization` — differs by legal entity |
 * | Reporting | "Which snapshot week is this?" | ADR-0003 — always weekly |
 * | Project | "How far into *this project* was it?" | `project` — starts at the project's own start date |
 *
 * A margin figure stated "for Q3" is meaningless until it says whose Q3. A trajectory slope stated
 * "per period" is meaningless until it says which period.
 */

export type CalendarDate = string & { readonly __calendarDateBrand: unique symbol };
export type WeekId = string & { readonly __weekIdBrand: unique symbol };

/** e.g. `FY2026-Q3`, `FY2026-M07`. Meaningless without the calendar that defines it. */
export type FiscalPeriodId = string & { readonly __fiscalPeriodIdBrand: unique symbol };

/** A reporting period is always a snapshot week in this product (ADR-0003 §3). */
export type ReportingPeriodId = WeekId;

/** Ordinal period since project start, 1-based. */
export type ProjectPeriodNumber = number & { readonly __projectPeriodBrand: unique symbol };

export type FiscalPeriodKind = 'MONTH' | 'QUARTER' | 'YEAR';

/**
 * A fiscal calendar as *data*. `organization` owns which calendar applies to which node;
 * this module only does arithmetic over whatever it is given.
 *
 * `startMonth` is 1-12: 1 = calendar year (the POC's assumed answer per OQ-5), 4 = April start,
 * 10 = October start. **Nothing here defaults it** — the caller must supply a calendar.
 */
export interface FiscalCalendarDefinition {
  readonly id: string;
  readonly name: string;
  /** First month of the fiscal year, 1-12. */
  readonly startMonth: number;
  /** Label prefix, e.g. "FY". */
  readonly yearLabelPrefix: string;
  /** Whether the fiscal year is labelled by its start or end calendar year. */
  readonly yearLabelledBy: 'START_YEAR' | 'END_YEAR';
}

export class PeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeriodError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(d: CalendarDate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split('-').map((n) => Number.parseInt(n, 10));
  return { y: y as number, m: m as number, d: day as number };
}

/** Days since epoch, UTC, no DST, no local time. Deterministic by construction. */
export function toEpochDay(d: CalendarDate): number {
  const { y, m, d: day } = parts(d);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function fromEpochDay(epochDay: number): CalendarDate {
  const ms = epochDay * 86_400_000;
  const y = new Date(ms).getUTCFullYear();
  const m = new Date(ms).getUTCMonth() + 1;
  const d = new Date(ms).getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as CalendarDate;
}

export function addDays(d: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(toEpochDay(d) + days);
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

// ---------------------------------------------------------------------------
// ISO-8601 weeks — the reporting period (ADR-0003 §3)
// ---------------------------------------------------------------------------

/** ISO weekday, Monday = 1 … Sunday = 7. */
function isoWeekday(epochDay: number): number {
  // 1970-01-01 was a Thursday (ISO 4).
  return ((epochDay + 3) % 7 + 7) % 7 + 1;
}

/** The Monday of the ISO week containing `d`. */
export function startOfWeek(d: CalendarDate): CalendarDate {
  const e = toEpochDay(d);
  return fromEpochDay(e - (isoWeekday(e) - 1));
}

/** ISO-8601 week identifier, e.g. `2026-W35`. */
export function weekOf(d: CalendarDate): WeekId {
  const monday = toEpochDay(startOfWeek(d));
  // The ISO year is that of the Thursday in the same week.
  const thursday = fromEpochDay(monday + 3);
  const { y } = parts(thursday);
  const jan4 = toEpochDay(`${String(y).padStart(4, '0')}-01-04` as CalendarDate);
  const week1Monday = jan4 - (isoWeekday(jan4) - 1);
  const week = Math.floor((monday - week1Monday) / 7) + 1;
  return `${y}-W${String(week).padStart(2, '0')}` as WeekId;
}

/** Monday of the given ISO week. Inverse of `weekOf` at week granularity. */
export function startOfWeekId(w: WeekId): CalendarDate {
  const [yStr, wStr] = w.split('-W');
  const y = Number.parseInt(yStr as string, 10);
  const week = Number.parseInt(wStr as string, 10);
  const jan4 = toEpochDay(`${String(y).padStart(4, '0')}-01-04` as CalendarDate);
  const week1Monday = jan4 - (isoWeekday(jan4) - 1);
  return fromEpochDay(week1Monday + (week - 1) * 7);
}

export function weeksBetween(from: WeekId, to: WeekId): number {
  return Math.round(daysBetween(startOfWeekId(from), startOfWeekId(to)) / 7);
}

export function addWeeks(w: WeekId, n: number): WeekId {
  return weekOf(addDays(startOfWeekId(w), n * 7));
}

/**
 * The trailing window a trajectory metric is defined over, oldest first.
 * `MET-FCST-001` is "the slope over trailing 8 **weekly** snapshots" — this is that window.
 */
export function trailingWeeks(endWeek: WeekId, count: number): WeekId[] {
  if (count < 1) throw new PeriodError(`A trailing window must contain at least one week; got ${count}.`);
  return Array.from({ length: count }, (_, i) => addWeeks(endWeek, -(count - 1 - i)));
}

// ---------------------------------------------------------------------------
// Fiscal periods — resolved against a supplied calendar, never assumed
// ---------------------------------------------------------------------------

export function fiscalYearOf(d: CalendarDate, cal: FiscalCalendarDefinition): number {
  const { y, m } = parts(d);
  const startYear = m >= cal.startMonth ? y : y - 1;
  return cal.yearLabelledBy === 'START_YEAR' ? startYear : startYear + 1;
}

/** Ordinal month within the fiscal year, 1-12. */
export function fiscalMonthOf(d: CalendarDate, cal: FiscalCalendarDefinition): number {
  const { m } = parts(d);
  return ((m - cal.startMonth + 12) % 12) + 1;
}

export function fiscalPeriodOf(
  d: CalendarDate,
  cal: FiscalCalendarDefinition,
  kind: FiscalPeriodKind,
): FiscalPeriodId {
  const year = fiscalYearOf(d, cal);
  const label = `${cal.yearLabelPrefix}${year}`;
  switch (kind) {
    case 'YEAR':
      return label as FiscalPeriodId;
    case 'QUARTER':
      return `${label}-Q${Math.ceil(fiscalMonthOf(d, cal) / 3)}` as FiscalPeriodId;
    case 'MONTH':
      return `${label}-M${String(fiscalMonthOf(d, cal)).padStart(2, '0')}` as FiscalPeriodId;
  }
}

// ---------------------------------------------------------------------------
// Project periods — relative to the project's own start
// ---------------------------------------------------------------------------

/**
 * 1-based period index since project start. A project period is a week, matching the snapshot
 * cadence, so "period 12" means the same thing on every project regardless of when it started.
 */
export function projectPeriodOf(d: CalendarDate, projectStart: CalendarDate): ProjectPeriodNumber {
  if (compareDates(d, projectStart) < 0) {
    throw new PeriodError(
      `Date ${d} precedes project start ${projectStart}; there is no project period for it.`,
    );
  }
  return (weeksBetween(weekOf(projectStart), weekOf(d)) + 1) as ProjectPeriodNumber;
}

export function isCalendarDate(v: string): v is CalendarDate {
  if (!DATE_RE.test(v)) return false;
  const { y, m, d } = parts(v as CalendarDate);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------------------
// As-of state (pre-Phase-11 architectural closure)
// ---------------------------------------------------------------------------

/**
 * Whether a dated event has happened **as of** an assessment date.
 *
 * ### Why this exists
 *
 * A record with a completion date is not closed because the field is populated — it is closed
 * because the date has *passed*. Twelve call sites across the adapters asked
 * `resolvedOn === undefined` and treated anything else as settled, which silently classified every
 * future-dated resolution as already done.
 *
 * The first instance found cost real signal: 15 of 19 genuinely open customer dependencies had a
 * `resolvedOn` in the future, so `MET-DEL-023` was `null` on 74 of 75 projects. The engine was
 * correct and its input was wrong, which is the hardest kind of defect to see — nothing throws, no
 * test fails, and the metric simply reports "not computable" for a reason that is untrue.
 *
 * A date **equal** to the assessment date counts as occurred: an assessment made on the day a
 * dependency resolves sees it resolved. That boundary is asserted by test rather than assumed.
 */
export function hasOccurredAsOf(
  date: CalendarDate | string | undefined, asOf: CalendarDate,
): boolean {
  return date !== undefined && date <= asOf;
}

/**
 * Whether a dated event is still **outstanding** as of an assessment date.
 *
 * The complement of `hasOccurredAsOf`, named for the question callers actually ask — an open defect,
 * an unresolved dependency, an undelivered milestone. `undefined` means never settled, and so is
 * open; a future date means not settled *yet*, and so is also open.
 */
export function isOpenAsOf(
  settledOn: CalendarDate | string | undefined, asOf: CalendarDate,
): boolean {
  return !hasOccurredAsOf(settledOn, asOf);
}

/**
 * The settlement date, or `undefined` where it has not happened yet as of the assessment date.
 *
 * Use when passing a record into an engine: a future-dated resolution must reach the engine as
 * *absent*, not as a date the engine will read as settled.
 */
export function settledOnAsOf(
  settledOn: CalendarDate | string | undefined, asOf: CalendarDate,
): CalendarDate | undefined {
  return hasOccurredAsOf(settledOn, asOf) ? (settledOn as CalendarDate) : undefined;
}
