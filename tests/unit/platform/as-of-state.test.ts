/**
 * As-of temporal state — the boundary cases that a naive null check gets wrong.
 *
 * This suite exists because of a defect that cost real signal and broke nothing visible: twelve call
 * sites asked `resolvedOn === undefined` and treated any populated date as settled. Fifteen of
 * nineteen genuinely open customer dependencies carried a resolution date in the **future**, so
 * `MET-DEL-023` reported "not computable" on 74 of 75 projects — for a reason that was untrue. No
 * test failed, nothing threw, and the metric simply went quiet.
 *
 * The boundary that matters most is **equality**: a record settling *on* the assessment date has
 * settled. That is a choice, and it is asserted here rather than left to whichever comparison
 * operator a call site happened to use.
 */
import { describe, expect, it } from 'vitest';
import { calendarDate, hasOccurredAsOf, isOpenAsOf, settledOnAsOf } from '@platform/time';

const ASOF = calendarDate('2026-08-31');
const YESTERDAY = calendarDate('2026-08-30');
const TOMORROW = calendarDate('2026-09-01');

describe('as-of temporal state', () => {
  it('treats a date before the assessment as occurred', () => {
    expect(hasOccurredAsOf(YESTERDAY, ASOF)).toBe(true);
    expect(isOpenAsOf(YESTERDAY, ASOF)).toBe(false);
  });

  it('treats a date equal to the assessment as occurred', () => {
    // Resolving today counts as resolved. The alternative — "not until tomorrow" — would make every
    // same-day settlement invisible on the day it happened.
    expect(hasOccurredAsOf(ASOF, ASOF)).toBe(true);
    expect(isOpenAsOf(ASOF, ASOF)).toBe(false);
  });

  it('treats a future date as NOT occurred — the defect this file exists for', () => {
    expect(hasOccurredAsOf(TOMORROW, ASOF)).toBe(false);
    expect(isOpenAsOf(TOMORROW, ASOF)).toBe(true);
  });

  it('treats an absent date as open', () => {
    expect(hasOccurredAsOf(undefined, ASOF)).toBe(false);
    expect(isOpenAsOf(undefined, ASOF)).toBe(true);
  });

  it('hands an engine a future settlement as absent, never as a date', () => {
    // An engine reading a populated `resolvedOn` will call it settled. A future one must not reach
    // it at all.
    expect(settledOnAsOf(TOMORROW, ASOF)).toBeUndefined();
    expect(settledOnAsOf(YESTERDAY, ASOF)).toBe(YESTERDAY);
    expect(settledOnAsOf(ASOF, ASOF)).toBe(ASOF);
    expect(settledOnAsOf(undefined, ASOF)).toBeUndefined();
  });

  it('is the exact complement of itself, at every boundary', () => {
    for (const d of [YESTERDAY, ASOF, TOMORROW, undefined]) {
      expect(isOpenAsOf(d, ASOF)).toBe(!hasOccurredAsOf(d, ASOF));
    }
  });
});
