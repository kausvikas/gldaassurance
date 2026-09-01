/**
 * Lineage and freshness — "where did this number come from, and when was it last true?"
 *
 * `REQ-DATA-010` requires every derived value to record its inputs, rule version and computation
 * time. Phase 4 built the explanation object that carries that per assessment; this service answers
 * the same question at the *source* level, which is the one an executive actually asks first: not
 * "which rule fired" but "is this current?"
 *
 * **The degraded state is the point.** A dashboard that shows a number with no indication that the
 * finance feed last landed eleven days ago is worse than a blank dashboard: it converts a known
 * unknown into a confident wrong answer. So freshness has four states, `servingLastKnownGood` is
 * carried explicitly, and a stale source is named rather than counted.
 */
import { type Instant, daysBetweenInstants } from '@platform/time';
import type { RecordRef, RuleVersion } from '@platform/provenance';

export type FreshnessState = 'CURRENT' | 'STALE' | 'DEGRADED' | 'UNAVAILABLE';

export interface SourceStatus {
  readonly sourceSystemId: string;
  readonly displayName: string;
  readonly domains: readonly string[];
  readonly expectedCadenceDays: number;
  readonly lastSuccessfulSyncAt: Instant | null;
  readonly ageDays: number | null;
  readonly state: FreshnessState;
  /** True when the surface is showing the last good extract rather than live data. */
  readonly servingLastKnownGood: boolean;
  readonly narrative: string;
}

/** What one metric on one entity rests on. Returned by `GET /v1/lineage/:id`. */
export interface MetricLineage {
  readonly metricId: string;
  readonly epistemicLevel: 'L1_OBSERVED' | 'L2_DERIVED' | 'L3_ASSESSED';
  readonly authoritativeSourceType: string;
  /** The source systems that fed it, transitively. */
  readonly sources: readonly string[];
  /** Evidence record ids, so a claim can be walked back to rows (AC-3). */
  readonly evidence: readonly RecordRef[];
  readonly ruleVersion: RuleVersion | null;
  readonly computedAt: Instant | null;
  /** The worst freshness state among its sources — a chain is as fresh as its stalest link. */
  readonly freshness: FreshnessState;
}

export interface LineageReport {
  readonly entityId: string;
  readonly asOf: Instant;
  readonly sources: readonly SourceStatus[];
  readonly metrics: readonly MetricLineage[];
  /** The overall state a surface should badge. Worst-of, never averaged. */
  readonly overallFreshness: FreshnessState;
  readonly degradedSources: readonly string[];
}

export interface SourceObservation {
  readonly sourceSystemId: string;
  readonly displayName: string;
  readonly domains: readonly string[];
  readonly expectedCadenceDays: number;
  readonly lastSuccessfulSyncAt: Instant | null;
  /** True when the last attempt failed and the surface is serving the previous extract. */
  readonly lastAttemptFailed: boolean;
}

/** Ordered worst-last, so `worstOf` is a max over indices. */
const SEVERITY: readonly FreshnessState[] = ['CURRENT', 'STALE', 'DEGRADED', 'UNAVAILABLE'];

export function worstOf(states: readonly FreshnessState[]): FreshnessState {
  if (states.length === 0) return 'UNAVAILABLE';
  return states.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a));
}

/**
 * Classify one source.
 *
 * The thresholds are stated in cadences rather than absolute days, because "three days old" means
 * something different for a nightly finance extract than for a quarterly contract feed. One
 * cadence is current; up to two is stale; beyond that, or a failed attempt, is degraded; no
 * successful sync at all is unavailable.
 */
export function classifySource(observation: SourceObservation, asOf: Instant): SourceStatus {
  const { lastSuccessfulSyncAt: last, expectedCadenceDays: cadence } = observation;
  if (last === null) {
    return {
      ...observation,
      lastSuccessfulSyncAt: null,
      ageDays: null,
      state: 'UNAVAILABLE',
      servingLastKnownGood: false,
      narrative:
        `${observation.displayName} has never synced successfully. Nothing it feeds ` +
        `(${observation.domains.join(', ')}) can be relied on.`,
    };
  }

  const ageDays = daysBetweenInstants(last, asOf);
  const state: FreshnessState = observation.lastAttemptFailed
    ? 'DEGRADED'
    : ageDays <= cadence ? 'CURRENT'
    : ageDays <= cadence * 2 ? 'STALE'
    : 'DEGRADED';

  return {
    ...observation,
    lastSuccessfulSyncAt: last,
    ageDays,
    state,
    servingLastKnownGood: observation.lastAttemptFailed,
    narrative: observation.lastAttemptFailed
      ? `${observation.displayName} last synced ${ageDays}d ago and its most recent attempt failed. `
        + 'The surface is showing the last known good extract, not live data.'
      : `${observation.displayName} last synced ${ageDays}d ago against a ${cadence}d cadence.`,
  };
}

export interface MetricLineageInput {
  readonly metricId: string;
  readonly epistemicLevel: MetricLineage['epistemicLevel'];
  readonly authoritativeSourceType: string;
  readonly sources: readonly string[];
  readonly evidence: readonly RecordRef[];
  readonly ruleVersion: RuleVersion | null;
  readonly computedAt: Instant | null;
}

/**
 * Builds the report a surface badges from.
 *
 * `overallFreshness` is worst-of, not an average. Averaging freshness across six sources lets one
 * dead feed hide behind five healthy ones, which is precisely the situation the badge exists to
 * make visible.
 */
export function buildLineageReport(
  entityId: string,
  asOf: Instant,
  observations: readonly SourceObservation[],
  metrics: readonly MetricLineageInput[],
): LineageReport {
  const sources = observations.map((o) => classifySource(o, asOf));
  const byId = new Map(sources.map((s) => [s.sourceSystemId, s]));

  const withFreshness: MetricLineage[] = metrics.map((m) => ({
    ...m,
    freshness: worstOf(
      m.sources.map((id) => byId.get(id)?.state ?? 'UNAVAILABLE'),
    ),
  }));

  return {
    entityId,
    asOf,
    sources,
    metrics: withFreshness,
    overallFreshness: worstOf(sources.map((s) => s.state)),
    degradedSources: sources
      .filter((s) => s.state === 'DEGRADED' || s.state === 'UNAVAILABLE')
      .map((s) => s.displayName)
      .sort(),
  };
}
