/**
 * Recognised-revenue postings, with append-only accounting corrections.
 *
 * Phase 3 correction, Correction 6. Real Finance systems restate: a source correction, a late
 * posting, a reversal. Historical facts stay immutable; the *effective* position for a period
 * changes through further authoritative postings that name what they supersede.
 *
 * The synthetic corrections below are deterministic and few — enough for Phase 4 and later Finance
 * views to prove the model handles restatement, not an attempt to reproduce a real ledger.
 */
import { Money } from '@platform/decimal';
import { addDays, type CalendarDate } from '@platform/time';
import type { RecognisedRevenueFactRow } from './facts.js';
import { Rng, dec } from './rng.js';

export const RECOGNITION_POLICY_VERSION = 'RECOGNITION-v1';

const iso = (d: CalendarDate, h = 9) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;

export function originalPosting(args: {
  projectId: string; period: string; date: CalendarDate; periodAmount: number;
  cumulative: number; currency: string; seq: number;
}): RecognisedRevenueFactRow {
  const money = (n: number) => Money.of(dec(n), args.currency as never).toDto();
  return {
    id: `rrf-${args.projectId}-${args.period}-1`,
    projectId: args.projectId, reportingPeriodId: args.period, postingType: 'ORIGINAL',
    periodAmount: money(args.periodAmount), cumulativeAmount: money(args.cumulative),
    currency: args.currency,
    sourceRecordId: `GL-${args.projectId.slice(-3)}-${args.period.replace('-', '')}`,
    sourceVersion: '1',
    recognitionPolicyVersion: RECOGNITION_POLICY_VERSION,
    postingReference: `GL-${args.projectId.slice(-3)}-${args.period.replace('-', '')}`,
    sourceTimestamp: iso(addDays(args.date, 3)),
    ingestedAt: iso(addDays(args.date, 4)),
    synthetic: true,
  };
}

/**
 * Applies a deterministic correction to one project's posting history.
 *
 * Chosen by seeded draw over eligible projects so the count is stable across runs. The corrected
 * period is deliberately *not* the most recent one — a restatement that only ever touches last month
 * would not exercise the case that matters, which is a figure changing long after it was reported.
 */
export function applyCorrections(
  postings: readonly RecognisedRevenueFactRow[],
  projectId: string,
  currency: string,
  seed: string,
): RecognisedRevenueFactRow[] {
  if (postings.length < 6) return [...postings];
  const rng = Rng.fromSeed(`${seed}:recognition-correction:${projectId}`);
  const out = [...postings];

  // Correct a period from the middle of the history, so the correction lands months later.
  const targetIndex = Math.floor(postings.length * rng.range(0.25, 0.55));
  const target = postings[targetIndex] as RecognisedRevenueFactRow;
  const money = (n: number) => Money.of(dec(n), currency as never).toDto();
  const original = Number(target.periodAmount.amount);
  if (original <= 1000) return out;

  const kind = rng.float();
  const correctedOn = addDays(target.sourceTimestamp.slice(0, 10) as CalendarDate, rng.int(60, 130));

  if (kind < 0.5) {
    // ADJUSTMENT — a source correction reduces the period figure.
    const delta = -Math.round(original * rng.range(0.05, 0.18));
    out.push({
      ...target,
      id: `${target.id}-adj`,
      postingType: 'ADJUSTMENT',
      periodAmount: money(delta),
      cumulativeAmount: money(Math.max(0, Number(target.cumulativeAmount.amount) + delta)),
      supersedesFactId: target.id,
      originalFactId: target.id,
      sourceVersion: '2',
      postingReference: `${target.postingReference}-ADJ`,
      sourceTimestamp: iso(correctedOn),
      ingestedAt: iso(addDays(correctedOn, 1)),
    });
  } else if (kind < 0.8) {
    // REVERSAL then RESTATEMENT — the period is backed out and re-posted at a corrected figure.
    const reversalId = `${target.id}-rev`;
    out.push({
      ...target,
      id: reversalId, postingType: 'REVERSAL',
      periodAmount: money(-original),
      cumulativeAmount: money(Math.max(0, Number(target.cumulativeAmount.amount) - original)),
      supersedesFactId: target.id, originalFactId: target.id, sourceVersion: '2',
      postingReference: `${target.postingReference}-REV`,
      sourceTimestamp: iso(correctedOn), ingestedAt: iso(addDays(correctedOn, 1)),
    });
    const restated = Math.round(original * rng.range(0.82, 0.96));
    out.push({
      ...target,
      id: `${target.id}-res`, postingType: 'RESTATEMENT',
      periodAmount: money(restated),
      cumulativeAmount: money(Math.max(0, Number(target.cumulativeAmount.amount) - original + restated)),
      supersedesFactId: reversalId, originalFactId: target.id, sourceVersion: '3',
      postingReference: `${target.postingReference}-RES`,
      sourceTimestamp: iso(addDays(correctedOn, 1)), ingestedAt: iso(addDays(correctedOn, 2)),
    });
  }
  return out;
}

/** The effective figure for a period: the sum of every posting that applies to it. */
export function effectiveForPeriod(
  postings: readonly RecognisedRevenueFactRow[], period: string,
): { amount: number; postings: RecognisedRevenueFactRow[]; restated: boolean } {
  const forPeriod = postings.filter((r) => r.reportingPeriodId === period);
  return {
    amount: forPeriod.reduce((a, r) => a + Number(r.periodAmount.amount), 0),
    postings: forPeriod,
    restated: forPeriod.some((r) => r.postingType !== 'ORIGINAL'),
  };
}
