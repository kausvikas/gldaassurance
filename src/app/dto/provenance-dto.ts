/**
 * Wire representations. Everything the Presentation layer receives has this shape.
 *
 * Two properties are structural rather than conventional:
 *   - money crosses as a *string* amount plus a currency code, never a JS `number`
 *     (ADR-0002 §Decision 3);
 *   - every value carries its provenance envelope, so a value without one cannot be rendered
 *     (ADR-0004 §1, REQ-UX-004).
 */
import type { Money, MoneyDto, Ratio } from '@platform/decimal';
import { isComputable, ratioToPercentString } from '@platform/decimal';
import type { EpistemicLayer, Provenance, RecordRef } from '@platform/provenance';

export interface ProvenanceDto<T> {
  readonly value: T;
  readonly layer: EpistemicLayer;
  readonly sources: readonly RecordRef[];
  readonly ruleVersion?: string;
  readonly computedAt: string;
  readonly confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * A ratio on the wire. `null` means NOT_COMPUTABLE with a stated reason — never a silent
 * dash, never NaN (ADR-0002 §Decision 8, METRIC_CATALOG.md §1.1 rule 5).
 */
export interface RatioDto {
  readonly percent: string | null;
  readonly notComputableReason?: string;
}

export function toRatioDto(r: Ratio, decimals = 1): RatioDto {
  return isComputable(r)
    ? { percent: ratioToPercentString(r, decimals) }
    : { percent: null, notComputableReason: r.reason };
}

export function toMoneyDto(m: Money): MoneyDto {
  return m.toDto();
}

export function toProvenanceDto<T, U>(
  p: Provenance<T>,
  project: (value: T) => U,
): ProvenanceDto<U> {
  const base = {
    value: project(p.value),
    layer: p.layer,
    sources: p.sources,
    computedAt: p.computedAt as string,
  };
  return {
    ...base,
    ...(p.ruleVersion !== undefined ? { ruleVersion: p.ruleVersion as string } : {}),
    ...(p.confidence !== undefined ? { confidence: p.confidence } : {}),
  };
}
