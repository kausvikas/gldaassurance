/**
 * Public surface — platform/provenance.
 *
 * The provenance envelope required by ADR-0004 §1:
 *   `{ value, layer, sources, ruleVersion?, computedAt, confidence? }`
 * "A value without a provenance envelope may not be rendered (REQ-UX-004). This is enforced
 * by type, not by review."
 *
 * The constructors below encode ADR-0004 §2's directional rules as preconditions:
 *   - an L2 value must name the rule version that produced it (REQ-HLTH-005);
 *   - an L3 value must cite at least one L1/L2 source, or it may not exist (REQ-AI-002).
 */
import type { Instant } from '@platform/time';

export type EpistemicLayer = 'L1' | 'L2' | 'L3';

/** A reference to the record a value came from. Citations resolve through these (AC-3). */
export interface RecordRef {
  readonly context: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Metric ID from METRIC_CATALOG.md where the source is itself a derived value. */
  readonly metricId?: string;
}

/** Versioned rule set identifier, e.g. `HEALTH-v1` (METRIC_CATALOG.md §8). */
export type RuleVersion = string & { readonly __ruleVersionBrand: unique symbol };

export function ruleVersion(value: string): RuleVersion {
  if (!/^[A-Z][A-Z0-9_]*-v\d+$/.test(value)) {
    throw new TypeError(`Not a rule version (e.g. "HEALTH-v1"): "${value}".`);
  }
  return value as RuleVersion;
}

/** Data confidence band (MET-DQ-005). Never multiplied into a health score (§3.4). */
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Provenance<T> {
  readonly value: T;
  readonly layer: EpistemicLayer;
  readonly sources: readonly RecordRef[];
  readonly ruleVersion?: RuleVersion;
  readonly computedAt: Instant;
  readonly confidence?: ConfidenceBand;
}

export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvenanceError';
  }
}

/** L1 — something a person or source system recorded. */
export function observed<T>(
  value: T,
  source: RecordRef,
  computedAt: Instant,
): Provenance<T> {
  return { value, layer: 'L1', sources: [source], computedAt };
}

/** L2 — a pure function of L1 plus a versioned rule set. The rule version is mandatory. */
export function derived<T>(
  value: T,
  sources: readonly RecordRef[],
  rules: RuleVersion,
  computedAt: Instant,
): Provenance<T> {
  if (sources.length === 0) {
    throw new ProvenanceError(
      'An L2 value must name the L1 facts it was computed from (REQ-DATA-010).',
    );
  }
  return { value, layer: 'L2', sources, ruleVersion: rules, computedAt };
}

/** L3 — inferred. Refuses to exist without evidence (ADR-0004 §2, REQ-AI-002). */
export function inferred<T>(
  value: T,
  sources: readonly RecordRef[],
  computedAt: Instant,
  rules?: RuleVersion,
): Provenance<T> {
  if (sources.length === 0) {
    throw new ProvenanceError(
      'An L3 output that cannot cite the L1/L2 evidence it rests on may not be produced ' +
        '(ADR-0004 §2, REQ-AI-002).',
    );
  }
  return rules === undefined
    ? { value, layer: 'L3', sources, computedAt }
    : { value, layer: 'L3', sources, ruleVersion: rules, computedAt };
}

/**
 * ADR-0004 §4 — "the model never types a digit that reaches the screen as a fact".
 * The assistant emits a `ValueReference`; the presentation layer resolves it against a
 * domain-computed value and renders that. A wrong number is not expressible.
 */
export interface ValueReference {
  readonly kind: 'value-reference';
  readonly metricId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly asOf: Instant;
}

export function valueReference(
  metricId: string,
  entityType: string,
  entityId: string,
  asOf: Instant,
): ValueReference {
  return { kind: 'value-reference', metricId, entityType, entityId, asOf };
}

// ---------------------------------------------------------------------------
// Source authority and data context (ADR-0035 §3-§5).
// ---------------------------------------------------------------------------

/**
 * How much a source's assertion about a *particular canonical concept* counts.
 *
 * Declared here, in platform, rather than in `integration` or `knowledge`, because both of those are
 * tier-0 contexts that may not import each other — and because authority is a provenance property.
 * "Where did this come from" and "how much does it count" are the same question asked twice, and
 * splitting them across two definitions is how a registry and a retriever end up disagreeing about
 * what `SUPPLEMENTAL` means.
 *
 * Ordered, highest first. A value is governed by the highest-authority source that supplied it; a
 * lower-authority disagreement is disclosed, never merged and never averaged.
 */
export type SourceAuthorityClass =
  | 'AUTHORITATIVE'
  | 'GOVERNED_REFERENCE'
  | 'SUPPLEMENTAL'
  | 'EVIDENCE_ONLY'
  | 'UNVERIFIED';

export const AUTHORITY_ORDER: readonly SourceAuthorityClass[] = [
  'AUTHORITATIVE', 'GOVERNED_REFERENCE', 'SUPPLEMENTAL', 'EVIDENCE_ONLY', 'UNVERIFIED',
];

/** True when `a` is strictly more authoritative than `b`. Equal authority is not a winner. */
export function outranks(a: SourceAuthorityClass, b: SourceAuthorityClass): boolean {
  return AUTHORITY_ORDER.indexOf(a) < AUTHORITY_ORDER.indexOf(b);
}

/**
 * Which plane a record sits in (ADR-0035 §5).
 *
 * `CANONICAL` is the only context governed calculations read. Everything a user uploads enters at
 * `SANDBOX`, and the POC implements no code path that promotes anything past `APPROVED` — so the
 * frozen executive portfolio is safe by construction rather than by policy.
 */
export type DataContext = 'CANONICAL' | 'APPROVED' | 'VALIDATED' | 'SANDBOX';

export const PROMOTION_ORDER: readonly DataContext[] = ['SANDBOX', 'VALIDATED', 'APPROVED', 'CANONICAL'];

/** True when a record in `ctx` may be read as governed business truth. Only one value qualifies. */
export function isGoverned(ctx: DataContext): boolean {
  return ctx === 'CANONICAL';
}
