/**
 * `MET-FIN-018` Margin Bridge Decomposition — as-sold gross margin to forecast gross margin.
 *
 * **AC-4 is the whole point of this file**: *the sum of the named causes equals the total margin
 * delta, to the cent.* A bridge that nearly reconciles is worse than no bridge, because it invites a
 * reader to trust an attribution the arithmetic does not support.
 *
 * The metric is **Frozen**, and its registered cause list is implemented exactly as written:
 *
 * > *"Ordered causes summing exactly to `MET-FIN-017`: scope-without-CR, effort overrun, rate/mix,
 * > schedule extension, quality rework, pass-through, FX, named residual"*
 *
 * Two properties make that reconciliation structural rather than hopeful:
 *
 * 1. **The residual is computed as `total − Σ(named)`, never estimated.** It is the eighth cause the
 *    catalog names, not an error term smuggled in to make the row add up. Whatever the named causes
 *    fail to explain lands there **with a label**, and a large residual is a finding about the
 *    attribution, not something to hide.
 *
 * 2. **Effort overrun and rate/mix are a price/volume split, so they cannot double count.**
 *    `soldRate × (actualHours − plannedHours)` plus `(actualRate − soldRate) × actualHours` is
 *    identically `actualCost − plannedCost`, so the two terms partition the cost delta exactly and
 *    nothing is counted twice.
 *
 *    **This is the governed attribution convention, not the only valid one.** At least one other
 *    ordered decomposition also partitions the delta exactly — valuing rate drift across *planned*
 *    hours and the extra hours at the *actual* rate. The pairings differ in where they place the
 *    interaction term `(actualRate − soldRate) × (actualHours − plannedHours)`; **this convention
 *    assigns the whole interaction to rate/mix**, because the extra hours are valued at the rate
 *    they were sold at. The ordering is fixed and documented so attribution is deterministic —
 *    a previous version of this comment claimed uniqueness, which is mathematically false.
 *
 * ### Attribution honesty
 *
 * Every cause carries a `basis`. `DERIVED` means it came from a governed metric over observed facts.
 * **`MODELLED` means a modelling choice was made** — valuing hours at a rate is a choice, and the
 * page must say so rather than present it as accounting truth. `NOT_ATTRIBUTED` means the cause is
 * real but this repository cannot yet measure it, and `NOT_APPLICABLE` means it cannot arise for
 * this portfolio. None of the four is ever silently rendered as a zero contribution.
 */
import {
  type CurrencyCode, Money, type Quantity, qAbs, qAdd, qCompare, qDiv, qFixed, qMul, qSub, qToNumber,
  qty,
} from '@platform/decimal';
import type { Instant } from '@platform/time';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * How much a cause figure can be relied upon.
 *
 * The distinction an executive surface must not blur: a number derived from governed metrics over
 * observed facts is a different kind of claim from one produced by valuing a quantity at a chosen
 * rate, and both are different from a gap nobody has measured.
 */
export type AttributionBasis = 'DERIVED' | 'MODELLED' | 'NOT_ATTRIBUTED' | 'NOT_APPLICABLE' | 'RESIDUAL';

export interface MarginBridgeInput {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly currency: CurrencyCode;
  /** `MET-FIN-026` — sold gross margin, the bridge's opening balance. */
  readonly soldGmValue: Money;
  /** `MET-FIN-024` — forecast gross margin, the bridge's closing balance. */
  readonly forecastGmValue: Money;
  /** `MET-FIN-017` — the delta the causes must sum to. Supplied, never recomputed here. */
  readonly marginValueDelta: Money;
  /** `MET-FIN-032` — risk-adjusted gross margin, the scenario step beyond forecast. */
  readonly riskAdjustedGmValue: Money;

  // --- cause inputs, each from its owning context's engine -------------------
  /** Value of delivered-but-uncontracted scope. Feeds the scope-without-CR cause. */
  readonly uncompensatedScopeValue: Money;
  /** `MET-RES-002` — actual hours less planned hours. `null` where effort is unrecorded. */
  readonly effortVarianceHours: Quantity | null;
  /** `contract:baseline.blendedRate` — the rate the extra hours are valued at. */
  readonly soldBlendedRate: Money;
  /** `MET-RES-010` — rate drift across hours to date. `null` where not computable. */
  readonly resourceCostDriftImpact: Money | null;
  /** `MET-QUA-012` — excess rework cost above the priced allowance. `null` where not computable. */
  readonly excessReworkCost: Money | null;
  /** `MET-FIN-038` — FX margin impact. `null` where the portfolio is single-currency. */
  readonly fxMarginImpact: Money | null;
  /** Net margin contributed by executed change requests: Σ valueDelta − Σ costDelta. */
  readonly executedChangeMargin: Money;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface BridgeCause {
  readonly id: string;
  readonly label: string;
  /** The registered metric this cause is measured by, where one exists. */
  readonly metricId: string | null;
  /** Signed. Negative destroys margin; positive protects or recovers it. */
  readonly amount: Money;
  readonly basis: AttributionBasis;
  /** Why the figure is what it is, including why it is zero when it is. */
  readonly explanation: string;
}

export interface MarginBridge {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly metricId: 'MET-FIN-018';
  /** Opening balance: `MET-FIN-026`. */
  readonly soldGm: Money;
  /** The ordered causes, exactly as `MET-FIN-018` registers them. */
  readonly causes: readonly BridgeCause[];
  /** Closing balance: `MET-FIN-024`. */
  readonly forecastGm: Money;
  /** The scenario step beyond the bridge: `MET-FIN-032`. Never inside the reconciliation. */
  readonly riskAdjustedGm: Money;
  /** `MET-FIN-017`, restated so a reader can check the sum without leaving the object. */
  readonly totalDelta: Money;
  /** Σ of the causes. Equal to `totalDelta` by construction; asserted by test to the cent. */
  readonly causeSum: Money;
  /** `true` when `causeSum` equals `totalDelta` exactly. AC-4. */
  readonly reconciles: boolean;
  /**
   * Named components *inside* the residual that are exactly computable.
   *
   * Not part of `MET-FIN-018` — the metric names eight causes and this is a breakdown of the
   * eighth. Shown separately so a large residual can be interrogated rather than shrugged at.
   */
  readonly residualComponents: readonly BridgeCause[];
  /** Causes ranked by absolute margin destroyed. REQ-MRGN-002. */
  readonly rankedDestroyers: readonly BridgeCause[];
  /**
   * How much of the bridge's gross movement the **named** causes actually account for.
   *
   * `Σ|named| / (Σ|named| + |residual|)`, as a ratio in `[0,1]`.
   *
   * Reconciling and explaining are different claims, and the bridge reconciles **by construction**:
   * the residual is defined as `total − Σ(named)`, so AC-4 holds no matter how little the named
   * causes explain. A reader who sees a waterfall that adds up will assume it also accounts for the
   * movement. This is the figure that tells them whether it does (DR-062).
   */
  readonly explanatoryCoverage: Quantity | null;
  /** `MET-FIN-041`, so the value on an executive page resolves to a catalog entry. */
  readonly explanatoryCoverageMetricId: 'MET-FIN-041';
  /** The coverage stated in words, so a low figure cannot be passed over as a decoration. */
  readonly explanatoryCoverageNarrative: string;
}

// ---------------------------------------------------------------------------

/**
 * Rounds a set of signed amounts to whole cents so the parts still sum to the rounded whole.
 *
 * Largest-remainder, as `MET-FIN-018` registers. Naïve per-row rounding can leave the displayed
 * parts a cent away from the displayed total, and on a reconciling waterfall that single cent is
 * indistinguishable from a broken attribution.
 *
 * Exported for test: the property is easier to falsify directly than through a bridge.
 */
export function largestRemainderCents(
  amounts: readonly Money[], total: Money,
): readonly Money[] {
  if (amounts.length === 0) return [];
  const currency = total.toDto().currency as CurrencyCode;

  /** Exact cents as a decimal quantity. No float touches this — G-FLOAT, and ADR-0002. */
  const centsOf = (m: Money): Quantity => qMul(m.toQuantity(), qty('100'));
  /** Truncation toward zero: the integer part of the decimal string, sign preserved. */
  const truncate = (q: Quantity): Quantity => qty((q.split('.')[0] ?? '0') || '0');

  const target = truncate(centsOf(total));
  const parts = amounts.map((m) => {
    const exact = centsOf(m);
    const whole = truncate(exact);
    // The discarded magnitude, always non-negative, so the ordering below is sign-agnostic.
    return { whole, remainder: qAbs(qSub(exact, whole)) };
  });

  const assigned = parts.reduce((a, x) => qAdd(a, x.whole), qty('0'));
  let gap = qToNumber(qSub(target, assigned));

  // Largest discarded fraction is served first; ties keep input order, so the result is
  // deterministic for identical inputs (AC-7).
  const order = parts
    .map((x, index) => ({ index, remainder: x.remainder }))
    .sort((a, b) => qCompare(b.remainder, a.remainder) || a.index - b.index);

  const result = parts.map((x) => x.whole);
  let cursor = 0;
  while (gap !== 0 && order.length > 0) {
    const slot = order[cursor % order.length] as { index: number };
    const step = gap > 0 ? '1' : '-1';
    result[slot.index] = qAdd(result[slot.index] as Quantity, qty(step));
    gap -= gap > 0 ? 1 : -1;
    cursor += 1;
  }

  // Back to money: divide the integer cents by 100, exactly.
  return result.map((c) => Money.of(qDiv(c, qty('100')) ?? '0', currency));
}

/**
 * The bridge, in one deterministic pass.
 *
 * Pure over its inputs. Every operand arrives already computed by the context that owns it; this
 * function decides only how the delta is *partitioned*, which is the one judgement `MET-FIN-018`
 * actually makes.
 */
export function buildMarginBridge(input: MarginBridgeInput): MarginBridge {
  const zero = Money.zero(input.currency);
  const neg = (m: Money): Money => m.negated();

  // 1 — scope delivered with no change request behind it. Margin given away.
  const scopeWithoutCr: BridgeCause = {
    id: 'scope-without-cr',
    label: 'Scope delivered without a change request',
    metricId: 'MET-COM-009',
    amount: neg(input.uncompensatedScopeValue),
    basis: input.uncompensatedScopeValue.isZero() ? 'DERIVED' : 'DERIVED',
    explanation: input.uncompensatedScopeValue.isZero()
      ? 'No delivered scope is recorded as uncontracted.'
      : 'Work delivered without an executed change request behind it: the cost was incurred and no '
        + 'revenue was contracted against it.',
  };

  // 2 — extra hours, valued at the rate they were sold at.
  const effortOverrun: BridgeCause = input.effortVarianceHours === null
    ? {
      id: 'effort-overrun',
      label: 'Effort overrun',
      metricId: 'MET-RES-002',
      amount: zero,
      basis: 'NOT_ATTRIBUTED',
      explanation: 'No effort is recorded against this project, so hours cannot be compared with '
        + 'the priced plan. Any effort effect is inside the residual.',
    }
    : {
      id: 'effort-overrun',
      label: 'Effort overrun',
      metricId: 'MET-RES-002',
      amount: neg(input.soldBlendedRate.times(input.effortVarianceHours)),
      basis: 'MODELLED',
      explanation: `${input.effortVarianceHours} hours against the priced plan, valued at the `
        + 'as-sold blended rate. **Modelled**: valuing hours at the sold rate is the pairing that '
        + 'partitions the cost delta exactly against rate/mix, not an invoiced amount.',
    };

  // 3 — the rate actually paid, against the rate sold, across hours delivered.
  const rateMix: BridgeCause = input.resourceCostDriftImpact === null
    ? {
      id: 'rate-mix',
      label: 'Rate and seniority mix',
      metricId: 'MET-RES-010',
      amount: zero,
      basis: 'NOT_ATTRIBUTED',
      explanation: 'No blended rate variance is computable, so rate drift cannot be separated from '
        + 'the residual.',
    }
    : {
      id: 'rate-mix',
      label: 'Rate and seniority mix',
      metricId: 'MET-RES-010',
      amount: neg(input.resourceCostDriftImpact),
      basis: 'MODELLED',
      explanation: 'The gap between the blended rate actually paid and the rate priced, across the '
        + 'hours delivered. **Modelled**: it attributes a cost difference to staffing shape without '
        + 'a per-assignment reconciliation.',
    };

  // 4 — schedule extension. Real, and not measurable here.
  const scheduleExtension: BridgeCause = {
    id: 'schedule-extension',
    label: 'Schedule extension',
    metricId: 'MET-DEL-011',
    amount: zero,
    basis: 'NOT_ATTRIBUTED',
    explanation: 'A forecast completion date now exists (DR-050 closed) and 30 of 75 projects are '
      + 'forecast past their committed date — so the schedule slip is **measurable**. Its margin '
      + 'cost is not. The cost of running longer is already inside the estimate at completion, and '
      + 'therefore already inside MET-FIN-024, this bridge\'s closing balance. Attributing it again '
      + 'here would double count against the residual. Separating it needs an ETC decomposed by '
      + 'cause, which the facts do not carry (DR-058).',
  };

  // 5 — rework above what the price assumed.
  const qualityRework: BridgeCause = input.excessReworkCost === null
    ? {
      id: 'quality-rework',
      label: 'Quality and rework',
      metricId: 'MET-QUA-012',
      amount: zero,
      basis: 'NOT_ATTRIBUTED',
      explanation: 'Excess rework cost is not computable for this project, so rework effect is '
        + 'inside the residual.',
    }
    : {
      id: 'quality-rework',
      label: 'Quality and rework',
      metricId: 'MET-QUA-012',
      amount: neg(input.excessReworkCost),
      basis: 'DERIVED',
      explanation: input.excessReworkCost.isZero()
        ? 'Rework is at or below the allowance priced into the contract, so no excess cost is '
          + 'attributed. Good quality does not create margin here; it simply does not destroy any.'
        : 'Rework hours above the allowance priced into the contract, valued at actual cost.',
    };

  // 6 — pass-through cost. Not modelled in this portfolio.
  const passThrough: BridgeCause = {
    id: 'pass-through',
    label: 'Pass-through cost',
    metricId: null,
    amount: zero,
    basis: 'NOT_APPLICABLE',
    explanation: 'The synthetic portfolio models no pass-through or third-party resale cost, so '
      + 'this cause cannot arise. It is registered in MET-FIN-018 and kept in the bridge so the '
      + 'cause list matches the metric.',
  };

  // 7 — FX. Single-currency portfolio.
  const fx: BridgeCause = input.fxMarginImpact === null
    ? {
      id: 'fx',
      label: 'FX movement',
      metricId: 'MET-FIN-038',
      amount: zero,
      basis: 'NOT_APPLICABLE',
      explanation: 'Every project in this portfolio is priced and costed in one currency, so there '
        + 'is no rate movement to isolate. MET-FIN-038 is structurally zero rather than unmeasured.',
    }
    : {
      id: 'fx',
      label: 'FX movement',
      metricId: 'MET-FIN-038',
      amount: input.fxMarginImpact,
      basis: 'DERIVED',
      explanation: 'Forecast margin at current rates against forecast margin at as-sold rates.',
    };

  /*
   * Round the named causes to whole cents **before** the residual is taken.
   *
   * `MET-FIN-018` registers largest-remainder allocation for exactly this reason. Two of the causes
   * are products of a division — a blended rate, a rate variance — and carry twenty significant
   * digits. Summing those and subtracting from the delta leaves a residual that reconciles in
   * principle and, at the twentieth decimal place, does not: on ten of seventy-five projects the
   * sum landed at −47,999.9199999999999999999999999999 against a delta of −47,999.92.
   *
   * AC-4 is stated in cents, so the bridge is settled in cents. Rounding first and taking the
   * residual from the rounded parts makes the reconciliation exact by construction rather than
   * exact-to-a-tolerance, which is the difference between a property and a hope.
   */
  const namedRaw = [
    scopeWithoutCr, effortOverrun, rateMix, scheduleExtension, qualityRework, passThrough, fx,
  ];
  const rawSum = namedRaw.reduce((a, c) => a.plus(c.amount), zero);
  const roundedAmounts = largestRemainderCents(namedRaw.map((c) => c.amount), rawSum);
  const named = namedRaw.map((c, index) => ({
    ...c, amount: roundedAmounts[index] as Money,
  }));
  const namedSum = named.reduce((a, c) => a.plus(c.amount), zero);

  // 8 — the residual. Computed, never estimated, and named.
  const residualAmount = input.marginValueDelta.minus(namedSum);
  const residual: BridgeCause = {
    id: 'residual',
    label: 'Unattributed residual',
    metricId: 'MET-FIN-018',
    amount: residualAmount,
    basis: 'RESIDUAL',
    explanation: 'The part of the margin delta the named causes do not account for, computed as '
      + 'the total less the named causes so the bridge reconciles exactly. A large residual is a '
      + 'finding about the attribution, not a rounding artefact — the components below are the part '
      + 'of it that can be named.',
  };

  const causes = [...named, residual];
  const causeSum = causes.reduce((a, c) => a.plus(c.amount), zero);

  // Named components inside the residual. Exactly computable, and not MET-FIN-018 causes.
  const residualComponents: readonly BridgeCause[] = [
    {
      id: 'executed-cr-recovery',
      label: 'Executed change request recovery',
      metricId: 'MET-FIN-002',
      amount: input.executedChangeMargin,
      basis: 'DERIVED',
      explanation: 'Net margin contributed by executed change requests — contracted value less '
        + 'contracted cost. It moves the bridge because MET-FIN-017 measures against the **as-sold** '
        + 'baseline, and MET-FIN-018 does not name it as a separate cause, so it sits here.',
    },
  ];

  const rankedDestroyers = [...causes]
    .filter((c) => qCompare(c.amount.toQuantity(), qty('0')) < 0)
    .sort((a, b) => qCompare(qAbs(b.amount.toQuantity()), qAbs(a.amount.toQuantity())));

  // Reconciliation is guaranteed; explanation is not. Measure the difference and say so.
  const namedGross = named.reduce((a, c) => qAdd(a, qAbs(c.amount.toQuantity())), qty('0'));
  const residualGross = qAbs(residual.amount.toQuantity());
  const gross = qAdd(namedGross, residualGross);
  // Zero gross movement means there is nothing to attribute, so there is no share to report.
  // Returning 1 would assert "fully explained" about a bridge with nothing in it -- a vacuous
  // 100% that a reader could still quote. NOT_COMPUTABLE is the honest answer (ADR-0025 D-4).
  const explanatoryCoverage = qCompare(gross, qty('0')) === 0
    ? null
    : qDiv(namedGross, gross) ?? null;
  const explanatoryCoverageNarrative = explanatoryCoverage === null
    ? 'MET-FIN-041 is not computable: this bridge has no gross movement to attribute, so there is '
      + 'no share to report. Not zero, and not 100% -- there is nothing to explain.'
    : `The named causes account for ${qFixed(qMul(explanatoryCoverage, qty('100')), 1)}% of the `
      + 'GROSS movement in this bridge; the remainder sits in the unattributed residual. '
      + '**This is a gross attribution share, not the share of NET margin change explained** '
      + '(MET-FIN-041), and it is **not the same claim as AC-4**: the bridge reconciles to the cent '
      + 'by construction, because the residual is defined as the total less the named causes, so it '
      + 'would still reconcile if the named causes explained nothing. '
      + (qCompare(explanatoryCoverage, qty('0.5')) < 0
        ? 'Here they carry less than half, so this decomposition should be read as a partial '
          + 'attribution and not as the reason margin moved (DR-062).'
        : 'Here they carry the majority of the movement, which is what makes the ranking below '
          + 'usable as a driver list.');

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    metricId: 'MET-FIN-018',
    soldGm: input.soldGmValue,
    causes,
    forecastGm: input.forecastGmValue,
    riskAdjustedGm: input.riskAdjustedGmValue,
    totalDelta: input.marginValueDelta,
    causeSum,
    reconciles: causeSum.toQuantity() === input.marginValueDelta.toQuantity(),
    residualComponents,
    rankedDestroyers,
    explanatoryCoverage,
    explanatoryCoverageMetricId: 'MET-FIN-041',
    explanatoryCoverageNarrative,
  };
}
