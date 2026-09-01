/**
 * Registry builder. Keeps each definition readable by supplying the defaults that are true for
 * most metrics, so the fields that differ are the ones a reviewer sees.
 */
import { calendarDate } from '@platform/time';
import {
  type EdgeHandling,
  type EngagementModel,
  type MetricDefinition,
  metricId,
} from '../metric-types.js';

/** Phase 2 freeze date. Every definition in this registry is effective from the same day. */
export const CATALOG_EFFECTIVE_FROM = calendarDate('2026-08-31');

export const ALL_CONTRACT_TYPES: readonly EngagementModel[] = [
  'FIXED_BID',
  'TIME_AND_MATERIALS',
  'CAPACITY',
];

/** Metrics whose meaning depends on scope risk sitting with the supplier. */
export const FIXED_BID_ONLY: readonly EngagementModel[] = ['FIXED_BID'];

const NO_DENOMINATOR: EdgeHandling = {
  zeroDenominator: 'NOT_APPLICABLE',
  missingInput: 'NOT_COMPUTABLE',
  minimumHistoryWeeks: 0,
};

export const EDGE = {
  noDenominator: NO_DENOMINATOR,
  ratio: {
    zeroDenominator: 'NOT_COMPUTABLE',
    missingInput: 'NOT_COMPUTABLE',
    minimumHistoryWeeks: 0,
  } satisfies EdgeHandling,
  /** Trailing-window metrics need history before they mean anything. */
  window: (weeks: number): EdgeHandling => ({
    zeroDenominator: 'NOT_COMPUTABLE',
    missingInput: 'NOT_COMPUTABLE',
    minimumHistoryWeeks: weeks,
  }),
} as const;

type Input = Omit<MetricDefinition, 'id' | 'effectiveFrom'> & { readonly id: string };

/** Builds one definition, validating the ID shape as it goes. */
export function def(d: Input): MetricDefinition {
  return { ...d, id: metricId(d.id), effectiveFrom: CATALOG_EFFECTIVE_FROM };
}
