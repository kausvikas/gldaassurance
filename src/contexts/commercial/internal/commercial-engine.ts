/**
 * Commercial derivation — the Scope & Commercial half of `MET-HLTH-011`.
 *
 * **Why this file exists here and not somewhere else.** `MET-COM-007`, `MET-COM-008` and
 * `MET-COM-009` are registered `L2_DERIVED` with `owner: Commercial`, and `CommercialSnapshot` in
 * this context's public surface has declared all three since Phase 2. The manifest's
 * `outputLayers: ["L1"]` contradicted both, which is what `CONFLICT C-21` was: a stale manifest
 * entry, not a governing prohibition. Resolved at Phase 8 closure by ADR-0022 D-1/D-2 — an epistemic
 * layer is a property of a *value*, not of a module, so a fact-owning context may derive from its
 * own facts. The alternative placements were all worse: `health` would become the owner of change-
 * control arithmetic, and an adapter would put a governed formula outside the product.
 *
 * Tier 2, `mayDependOn: ['contract']`, so this file imports no sibling engine (ADR-0001 §4.1).
 *
 * ### The rule every function obeys
 *
 * **A metric with no population returns `null` and says why.** An empty pending-change list is not
 * "zero days of ageing"; it is a project with nothing pending, and the two must not collapse to the
 * same number on the way into a health signal. A zero would score as *perfect* against a 21/120-day
 * edge scale and would silently improve the dimension.
 */
import { type Money, type Quantity, qAdd, qDiv, qSub, qty } from '@platform/decimal';
import type { NotEvaluatedReasonCode, SignalState } from '@platform/explainability';
import type { CalendarDate, Instant } from '@platform/time';
import { daysBetween, dateOf } from '@platform/time';

// ---------------------------------------------------------------------------
// Inputs — supplied by the Application layer, never fetched here
// ---------------------------------------------------------------------------

/** A change request raised but not yet executed. Superseded ones are out of population. */
export interface PendingChangeInput {
  readonly id: string;
  readonly raisedOn: CalendarDate;
  readonly proposedValue: Money;
  readonly superseded: boolean;
}

/** A unit of delivered scope. `uncontracted` marks work done with no executed change covering it. */
export interface ScopeItemInput {
  readonly id: string;
  readonly uncontracted: boolean;
  readonly completedOn?: CalendarDate;
  /** Absent where nobody has priced the item — a different fact from a zero-value item. */
  readonly estimatedValue?: Money;
}

export interface CommercialEvaluationInput {
  readonly projectId: string;
  readonly asOf: Instant;
  /** `MET-FIN-001` — as-sold contract value, the denominator of the scope-change ratio. */
  readonly contractValueAsSold: Money;
  /** `MET-FIN-002` — current contractual revenue, as-sold plus executed changes. */
  readonly contractualRevenue: Money;
  readonly pendingChanges: readonly PendingChangeInput[];
  readonly scopeItems: readonly ScopeItemInput[];
  /**
   * `MET-COM-011` numerator — live liquidated-damages exposure.
   *
   * Liquidated damages are a **contractual** remedy path: the exposure does not resolve through
   * delivery recovery, which is why `OVR-LD-EXPOSURE` forces RED in its own right rather than being
   * absorbed into the weighted composite. Every exposure figure is an estimate (ADR-0025).
   */
  readonly liquidatedDamagesExposure: Money;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DerivedValue<T> {
  /** The epistemic state of this value (ADR-0028 D-1). */
  readonly state?: SignalState;
  readonly stateReasonCode?: NotEvaluatedReasonCode;
  readonly metricId: string;
  readonly value: T | null;
  readonly notComputableReason?: string;
}

export interface CommercialEvaluation {
  readonly projectId: string;
  readonly asOf: Instant;
  /** `MET-COM-007` — the **oldest** unsuperseded pending change, in days (ADR-0022 D-3). */
  readonly maxPendingCrAgeDays: DerivedValue<number>;
  /** The mean the health signal collapsed. Reported so the distribution stays visible. */
  readonly meanPendingCrAgeDays: DerivedValue<number>;
  readonly openPendingChanges: number;
  /** `MET-COM-008` — `MET-FIN-002 / MET-FIN-001 − 1`. Signed: scope can be removed. */
  readonly scopeChangeRatio: DerivedValue<Quantity>;
  /** `MET-COM-009` — value of delivered-but-uncontracted scope over `MET-FIN-002`. */
  readonly uncompensatedScopeRatio: DerivedValue<Quantity>;
  /** The numerator of `MET-COM-009`, so a reader can see what was counted. */
  readonly uncompensatedScopeValue: Money;
  /** `MET-COM-011` — live liquidated-damages exposure over `MET-FIN-002`. */
  readonly liquidatedDamagesRatio: DerivedValue<Quantity>;
  /** The numerator of `MET-COM-011`, so the ratio can be checked without leaving the object. */
  readonly liquidatedDamagesExposure: Money;
  /** Uncontracted items nobody has priced. They are excluded from the ratio and named here. */
  readonly unpricedUncontractedItems: number;
}

const nc = <T>(metricId: string, reason: string): DerivedValue<T> =>
  ({ metricId, value: null, notComputableReason: reason });

const ok = <T>(metricId: string, value: T): DerivedValue<T> => ({ metricId, value });

/** The risk object does not exist here: nothing is missing, and renormalising it away is safe. */
const na = <T>(metricId: string, reason: string): DerivedValue<T> => ({
  metricId, value: null, state: 'NOT_APPLICABLE',
  stateReasonCode: 'RISK_OBJECT_ABSENT', notComputableReason: reason,
});

/**
 * Every registered commercial derivation, in one deterministic pass.
 *
 * Pure: same inputs, same output, no clock read and no I/O. `asOf` is supplied because "how old is
 * this change request" is a question about a stated moment, not about now (G-CLOCK).
 */
export function evaluateCommercial(input: CommercialEvaluationInput): CommercialEvaluation {
  const today = dateOf(input.asOf);
  const zero = input.contractualRevenue.minus(input.contractualRevenue);

  // --- MET-COM-007: max and mean of (t − raisedAt) over unsuperseded pending changes ---
  const open = input.pendingChanges.filter((c) => !c.superseded);
  const ages = open.map((c) => daysBetween(c.raisedOn, today));
  let maxAge: DerivedValue<number>;
  let meanAge: DerivedValue<number>;
  if (ages.length === 0) {
    /*
     * No pending change request is NOT_APPLICABLE (ADR-0028 D-3), not unknown.
     *
     * The reasoning in the previous comment was right — reporting "0 days" would score as perfect
     * against a 21/120-day scale — but the state was wrong. Absence of the risk OBJECT is safe to
     * renormalise away; absence of EVIDENCE is not, and calling both NOT_COMPUTABLE meant a project
     * with no CRs was reported as provisionally assessed.
     */
    const reason = 'no unsuperseded pending change requests exist, so there is none to age';
    maxAge = na('MET-COM-007', reason);
    meanAge = na('MET-COM-007', reason);
  } else {
    maxAge = ok('MET-COM-007', Math.max(...ages));
    const total = ages.reduce((a, b) => a + b, 0);
    meanAge = ok('MET-COM-007', Math.round((total / ages.length) * 10) / 10);
  }

  // --- MET-COM-008: MET-FIN-002 / MET-FIN-001 − 1 ----------------------------
  // Signed on purpose. Descoping is a real commercial event and reporting it as an absolute
  // "change ratio" would make a contract that shrank look like one that grew.
  const scopeChangeRatio = input.contractValueAsSold.isZero()
    ? nc<Quantity>('MET-COM-008', 'the as-sold contract value is zero, so there is no baseline to change against')
    : (() => {
      const r = qDiv(input.contractualRevenue.toQuantity(), input.contractValueAsSold.toQuantity());
      return r === null
        ? nc<Quantity>('MET-COM-008', 'the as-sold contract value is zero')
        : ok('MET-COM-008', qSub(r, qty('1')));
    })();

  // --- MET-COM-009: uncontracted delivered scope / MET-FIN-002 ---------------
  // Only *delivered* uncontracted scope counts. Uncontracted work not yet done is a commercial
  // decision still available; work already delivered without a change request is money spent.
  const deliveredUncontracted = input.scopeItems.filter(
    (s) => s.uncontracted && s.completedOn !== undefined,
  );
  const priced = deliveredUncontracted.filter((s) => s.estimatedValue !== undefined);
  const uncompensatedScopeValue = priced.reduce(
    (m, s) => m.plus(s.estimatedValue as Money), zero,
  );
  const uncompensatedScopeRatio = input.contractualRevenue.isZero()
    ? nc<Quantity>('MET-COM-009', 'contractual revenue is zero, so there is no denominator')
    : (() => {
      const r = qDiv(uncompensatedScopeValue.toQuantity(), input.contractualRevenue.toQuantity());
      return r === null
        ? nc<Quantity>('MET-COM-009', 'contractual revenue is zero')
        : ok('MET-COM-009', r);
    })();

  // --- MET-COM-011: liquidated damages against contract value (ADR-0025) ----
  // Same denominator and the same zero guard as MET-COM-009: a ratio with no denominator is not
  // computable, and reporting it as zero would read as "no exposure" rather than "cannot tell".
  const liquidatedDamagesRatio = input.contractualRevenue.isZero()
    ? nc<Quantity>('MET-COM-011', 'contractual revenue is zero, so there is no denominator')
    : (() => {
      const r = qDiv(
        input.liquidatedDamagesExposure.toQuantity(),
        input.contractualRevenue.toQuantity(),
      );
      return r === null
        ? nc<Quantity>('MET-COM-011', 'contractual revenue is zero')
        : ok('MET-COM-011', r);
    })();

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    maxPendingCrAgeDays: maxAge,
    meanPendingCrAgeDays: meanAge,
    openPendingChanges: open.length,
    scopeChangeRatio,
    uncompensatedScopeRatio,
    uncompensatedScopeValue,
    liquidatedDamagesRatio,
    liquidatedDamagesExposure: input.liquidatedDamagesExposure,
    unpricedUncontractedItems: deliveredUncontracted.length - priced.length,
  };
}

/** `MET-FIN-011` proposed value still unsecured, for a caller that wants the figure beside the age. */
export function unsecuredUpsideOf(input: CommercialEvaluationInput): Money {
  const zero = input.contractualRevenue.minus(input.contractualRevenue);
  return input.pendingChanges
    .filter((c) => !c.superseded)
    .reduce((m, c) => m.plus(c.proposedValue), zero);
}

/** Sum helper kept local so no caller has to reach for a decimal primitive. */
export function totalQuantity(values: readonly Quantity[]): Quantity {
  return values.reduce((a, b) => qAdd(a, b), qty('0'));
}
