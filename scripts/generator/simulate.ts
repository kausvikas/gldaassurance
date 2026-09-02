/**
 * The weekly causal simulation.
 *
 * `SYNTHETIC_DATA_SPEC.md` G2 — symptoms are *generated from* causes. Each week the simulation
 * moves drivers, and cost, progress, defects, rework and commercial exposure fall out of them:
 *
 * ```
 *   scope arrives ──▶ remaining effort ↑ ──▶ ETC ↑ ──▶ EAC ↑ ──▶ GM ↓   (unless a CR is executed)
 *   defects ────────▶ rework hours ↑ ─────▶ productive hours ↓ ─▶ progress ↓ and cost ↑
 *   rate drift ─────▶ cost per hour ↑ ────▶ EAC ↑ ──────────────▶ GM ↓
 *   customer delay ─▶ blocked effort ↑ ───▶ progress ↓ and absorbed cost ↑
 * ```
 *
 * **Nothing derived is emitted.** Margin, EAC, health and trajectory are computed by Phase 4 from
 * these facts. The simulation tracks cost and progress internally because it must, in order to
 * decide what happens next week — but it publishes only what a source system would have recorded.
 *
 * Generator-internal arithmetic uses JS numbers: these are *generation decisions*, not the system of
 * record. Every emitted monetary value is snapped to a decimal string through `Money` at 2dp, and
 * the validator asserts decimal-safety across the whole corpus.
 */
import { Money } from '@platform/decimal';
import { addDays, calendarDate, compareDates, weekOf, type CalendarDate } from '@platform/time';
import { ARCHETYPE_BY_ID, PORTFOLIO_PATTERNS, type ArchetypeDrivers } from './archetypes.js';
import {
  type ProjectFacts, emptyFacts,
} from './facts.js';
import { buildBilling } from './billing.js';
import { applyCorrections, originalPosting } from './recognition.js';
import { AS_OF, historyStart, type ProjectSpec } from './portfolio.js';
import { Rng, dec } from './rng.js';

const WEEKLY_HOURS_PER_FTE = 34;

/** Classic delivery S-curve: slow start, fast middle, long tail. */
function plannedProgressAt(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return Math.min(1, 3 * f * f - 2 * f * f * f);
}

function iso(date: CalendarDate, hour = 9): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00Z`;
}

function driversFor(spec: ProjectSpec): ArchetypeDrivers {
  const base = ARCHETYPE_BY_ID.get(spec.archetype)?.drivers;
  if (!base) throw new Error(`Unknown archetype ${spec.archetype}`);
  let out: ArchetypeDrivers = { ...base };
  // Portfolio patterns nudge; they never override the archetype's narrative.
  for (const pattern of PORTFOLIO_PATTERNS) {
    if (!pattern.appliesTo(spec.vertical, spec.region)) continue;
    out = { ...out, ...Object.fromEntries(
      Object.entries(pattern.nudge).map(([k, v]) => {
        const current = out[k as keyof ArchetypeDrivers] as number;
        return [k, k === 'scopeCommercialisationRate' ? Math.min(current, v as number) : current + (v as number)];
      }),
    ) } as ArchetypeDrivers;
  }
  return out;
}

const SENIORITY: readonly ('PRINCIPAL' | 'SENIOR' | 'MID' | 'JUNIOR' | 'TRAINEE')[] =
  ['PRINCIPAL', 'SENIOR', 'MID', 'JUNIOR', 'TRAINEE'];

export interface SimulationResult {
  readonly facts: ProjectFacts;
  /** Internal end-state, used only by the validator to check causal coherence. Never emitted. */
  readonly trace: {
    readonly weeks: number;
    readonly costToDate: number;
    readonly physicalCompletion: number;
    readonly plannedCompletion: number;
    readonly etcRecorded: number;
    readonly committed: number;
    readonly contingencyConsumed: number;
    readonly reworkHours: number;
    readonly totalHours: number;
    readonly executedValueDelta: number;
    readonly pendingValue: number;
    readonly uncontractedValue: number;
    readonly gmHistory: { week: string; forecastGmPercent: number }[];
  };
}

export function simulateProject(spec: ProjectSpec, masterSeed: string): SimulationResult {
  const rng = Rng.fromSeed(`${masterSeed}:sim:${spec.projectId}`);
  const dr = driversFor(spec);
  const f = emptyFacts();

  const currency = spec.currency;
  const money = (n: number) => Money.of(dec(Math.max(0, n)), currency).toDto();
  const signedMoney = (n: number) => Money.of(dec(n), currency).toDto();

  const contractValue = Number(spec.contractValue.toDto().amount);
  const budgetedCost = Number(spec.budgetedCost.toDto().amount);
  const contingencyBudget = Number(spec.contingencyBudget.toDto().amount);
  const asSoldRate = Number(spec.blendedRate.toDto().amount);
  const plannedHours = Number(spec.plannedEffortHours);
  const hoursPerProgressPoint = plannedHours; // progress runs 0..1

  // --- team -----------------------------------------------------------------
  for (let i = 0; i < spec.teamSize; i += 1) {
    const band = SENIORITY[Math.min(SENIORITY.length - 1, Math.floor(rng.range(0, 5)))] as typeof SENIORITY[number];
    f.assignments.push({
      id: `asg-${spec.projectId}-${String(i + 1).padStart(2, '0')}`,
      projectId: spec.projectId,
      // A synthetic persona handle. No generated human names anywhere (REQ-DATA-009).
      personRef: `psn-${String(rng.int(1000, 9999))}`,
      seniorityBand: band,
      // DR-056: delivery location and engagement type. A site and a contract form — never an
      // address, a supplier name or anything that identifies a person.
      deliveryLocation: rng.pick(['ONSHORE', 'NEARSHORE', 'OFFSHORE'] as const),
      engagementType: rng.chance(0.22) ? 'SUBCONTRACTOR' : 'EMPLOYEE',
      startedOn: spec.startDate,
      allocationPercent: dec(rng.range(0.6, 1.0), 4),
      synthetic: true,
    });
  }

  // --- milestones -----------------------------------------------------------
  const milestoneCount = Math.max(3, Math.min(9, Math.round(spec.durationWeeks / 14)));
  for (let m = 1; m <= milestoneCount; m += 1) {
    const at = addDays(spec.startDate, Math.round((spec.durationWeeks * 7 * m) / (milestoneCount + 1)));
    const gating = m % 2 === 1;
    // DR-051: a project carrying productivity drag slips its **undelivered** milestones. Before
    // this, 2 of 527 milestones had a forecast different from baseline, so MET-DEL-009 and
    // MET-DEL-010 were constant zero and read as *perfect* into the Delivery dimension.
    const slipDays = dr.productivityDrag > 1 && at > AS_OF
      ? Math.round((dr.productivityDrag - 1) * 90 * rng.range(0.4, 1.3))
      : 0;
    f.milestones.push({
      id: `mst-${spec.projectId}-${m}`, projectId: spec.projectId,
      name: `Milestone ${m}`, baselineDate: at,
      forecastDate: slipDays > 0 ? addDays(at, slipDays) : at,
      paymentGating: gating,
      ...(gating ? { gatedValue: money(contractValue / Math.ceil(milestoneCount / 2)) } : {}),
      synthetic: true,
    });
  }

  // --- weekly loop ----------------------------------------------------------
  const start = historyStart(spec);
  let cursor = start;
  let weekIndex = Math.max(0, Math.round((Date.parse(start) - Date.parse(spec.startDate)) / (7 * 86_400_000)));

  let physical = plannedProgressAt(weekIndex / spec.durationWeeks) * (dr.productivityDrag > 1 ? 0.94 : 1);
  let costToDate = physical * budgetedCost * (dr.productivityDrag > 1 ? 1.04 : 1);
  let contingencyConsumed = 0;
  let openMajorDefects = 0;
  let totalHours = physical * plannedHours;
  let reworkHours = 0;
  let etcRecorded = 0;
  let committed = 0;
  let executedValueDelta = 0;
  let executedCostDelta = 0;
  let pendingValue = 0;
  let uncontractedValue = 0;
  let cumulativeRecognised = 0;
  let lastRecognisedPeriod = '';
  let defectSeq = 0;
  let openDependency: { id: string; untilWeek: number } | undefined;
  const gmHistory: { week: string; forecastGmPercent: number }[] = [];

  while (compareDates(cursor, AS_OF) <= 0 && weekIndex <= spec.durationWeeks + 8) {
    const week = weekOf(cursor);
    const w = Rng.fromSeed(`${masterSeed}:${spec.projectId}:w${weekIndex}`);
    const inRecovery = dr.recoveryFromWeek !== undefined && weekIndex >= dr.recoveryFromWeek;

    // Driver evolution. Recovery reverses the drag rather than resetting it — improvement is
    // gradual, which is what distinguishes an improving Red from a healthy Green.
    const dragWeeks = inRecovery ? dr.recoveryFromWeek as number : weekIndex;
    const recoveryWeeks = inRecovery ? weekIndex - (dr.recoveryFromWeek as number) : 0;
    const drag = Math.max(0.9,
      dr.productivityDrag + dr.productivityDragPerWeek * dragWeeks + (inRecovery ? dr.productivityDragPerWeek * recoveryWeeks : 0));
    const rate = asSoldRate * (1 + dr.rateDriftPerWeek * weekIndex);

    // Customer dependency → blocked effort → progress down and absorbed cost up.
    if (!openDependency && w.chance(dr.dependencyBlockChance)) {
      const id = `dep-${spec.projectId}-${weekIndex}`;
      const durationWeeks = w.int(1, 5);
      openDependency = { id, untilWeek: weekIndex + durationWeeks };
      f.dependencies.push({
        id, projectId: spec.projectId,
        description: 'Awaiting customer environment access / test data provisioning',
        owner: 'CUSTOMER', raisedOn: cursor, dueOn: addDays(cursor, 7 * durationWeeks),
        resolvedOn: addDays(cursor, 7 * durationWeeks), blocking: true, synthetic: true,
      });
    }
    const blockedFraction = openDependency && weekIndex < openDependency.untilWeek ? w.range(0.15, 0.45) : 0;
    if (openDependency && weekIndex >= openDependency.untilWeek) openDependency = undefined;

    /*
     * Effort is spent against the plan's shape too, for the same reason progress is earned against
     * it.
     *
     * `spec.teamSize` is clamped to [4, 18] in portfolio.ts, so using it as the weekly effort
     * quota decoupled spend from the budget it is measured against: a project whose planned effort
     * implies 30 FTE burned 60% of its budgeted rate, and one implying 2 FTE burned double. Burn
     * gap is cost consumed minus physical completion, so that clamp alone produced +12 to +25pp
     * burn gaps and negative forecast margin on projects with no productivity drag and no scope
     * problem — the second reason the portfolio had almost no healthy population.
     *
     * Weekly effort is now the plan's own effort curve. Past the planned end date a project still
     * burns, at a reduced rate, because an overrunning team is smaller than a full one but is not
     * free — that residual is what makes a genuine overrun cost money.
     *
     * teamSize remains the organisational fact it always was, and still drives assignments and the
     * seniority pyramid. It is simply no longer the hidden denominator of delivery economics.
     */
    const plannedThisWeek = plannedProgressAt((weekIndex + 1) / spec.durationWeeks)
      - plannedProgressAt(weekIndex / spec.durationWeeks);
    const plannedWeeklyHours = plannedHours / spec.durationWeeks;
    const grossHours = Math.max(plannedThisWeek * plannedHours, plannedWeeklyHours * 0.3);
    const weekRework = Math.min(grossHours * 0.42, openMajorDefects * dr.reworkHoursPerDefectWeek);
    const blockedHours = grossHours * blockedFraction;
    const productiveHours = Math.max(0, grossHours - weekRework - blockedHours);

    /*
     * Progress is earned against the **plan's own shape**, not against a flat hourly quota.
     *
     * This previously read `productiveHours / (plannedHours * drag)`, which accrued completion
     * linearly while `plannedProgressAt` follows an S-curve (3f² − 2f³). Two structural biases fell
     * out of that, and together they made the synthetic portfolio unusable as a demonstration:
     *
     *   1. **Every project drifted behind its own plan through the back half of its life.** At 75%
     *      elapsed the S-curve expects 84.4% complete while a linear accrual reaches 75% — a ~9pp
     *      deficit that no driver caused and no intervention could fix, applied to every project
     *      regardless of archetype.
     *   2. **Large projects were starved outright.** `teamSize` is clamped to [4, 18] in
     *      portfolio.ts while it is also the numerator of progress, so a project whose planned
     *      effort implies 30 FTE received 18 and could never track its plan. Progress variances
     *      of −50pp and worse on HEALTHY_REFERENCE projects came from this clamp, not from
     *      productivity.
     *
     * The result was that 37 fixed-bid HEALTHY_REFERENCE projects produced 1 Green, 20 Amber and
     * 16 Red, which is why System Green-at-Risk had an empty candidate pool: the metric requires a
     * healthy population and the generator could not produce one.
     *
     * Progress is now the planned increment for this week, scaled by how much of the team's
     * capacity actually reached productive work (capacity lost to rework and customer blocking)
     * and by the archetype's productivity drag. A project with no drag, no rework and no blocked
     * effort tracks its plan exactly; every departure from plan is now caused by a driver the
     * archetype declares, which is what the archetypes were written to express.
     *
     * No threshold, weight, band edge or health rule is touched — this is synthetic input
     * generation only.
     */
    const capacityRatio = grossHours === 0 ? 0 : productiveHours / grossHours;
    /*
     * Past the planned end date the plan has no increment left to earn, but the work does.
     *
     * Without this an overrunning project freezes just short of complete, and the portfolio loses
     * the "delivered, still open" lifecycle state entirely — the one that makes
     * REQUIRED_VELOCITY_RATIO NOT_APPLICABLE for NO_REMAINING_WORK rather than not computable.
     * That state is a governed control condition the portfolio is required to exercise, so it is
     * generated deliberately here rather than left to fall out of an arithmetic edge.
     */
    /*
     * Delivery finishes when the project reaches acceptance, not when the calendar runs out.
     *
     * A project in UAT_ACCEPTANCE or CLOSED_OUT has built what it was contracted to build; what
     * remains is acceptance, not construction. Physical completion therefore converges on 1.0
     * across those sub-stages, which is both the realistic reading and the condition that makes
     * REQUIRED_VELOCITY_RATIO NOT_APPLICABLE for NO_REMAINING_WORK rather than not computable.
     *
     * That control state used to appear only by accident: the teamSize clamp let some projects
     * overshoot to 100% while still mid-execution, and a coverage test pinned itself to one of
     * them. Correcting the clamp removed the state along with the defect. It is generated
     * deliberately here so the portfolio exercises the state by contract instead of by artifact.
     */
    const elapsedFraction = weekIndex / spec.durationWeeks;
    const inAcceptance = elapsedFraction >= 0.87;
    const overrunCatchUp = plannedThisWeek <= 0 || inAcceptance ? (1 - physical) * 0.28 : 0;
    const progressIncrement = plannedThisWeek * (capacityRatio / drag) + overrunCatchUp * capacityRatio;
    physical = Math.min(1, physical + progressIncrement);
    totalHours += grossHours;
    reworkHours += weekRework;

    const labour = grossHours * rate;
    const nonLabour = labour * w.range(0.05, 0.11);
    costToDate += labour + nonLabour;

    // Effort records, per assignment. `isRework` is what makes MET-QUA-006 real, not decorative.
    const perAssignment = grossHours / f.assignments.length;
    const reworkPerAssignment = weekRework / f.assignments.length;
    for (const a of f.assignments) {
      if (w.chance(dr.reportingGapChance * 0.4)) continue; // a missed timesheet (G7)
      f.effort.push({
        projectId: spec.projectId, assignmentId: a.id, periodEnd: cursor, week,
        hours: dec(perAssignment - reworkPerAssignment), billable: true, isRework: false,
        ...(blockedFraction > 0 ? { blockedByDependencyId: openDependency?.id ?? `dep-${spec.projectId}-${weekIndex}` } : {}),
        // Late/backdated entry (G7) makes freshness measurable rather than uniform.
        recordedAt: iso(addDays(cursor, w.chance(0.08) ? w.int(5, 16) : 1), 17),
        synthetic: true,
      });
      if (reworkPerAssignment > 0.05) {
        f.effort.push({
          projectId: spec.projectId, assignmentId: a.id, periodEnd: cursor, week,
          hours: dec(reworkPerAssignment), billable: true, isRework: true,
          recordedAt: iso(addDays(cursor, 1), 17), synthetic: true,
        });
      }
    }

    f.actualCosts.push({
      id: `cst-${spec.projectId}-${weekIndex}-L`, projectId: spec.projectId, periodEnd: cursor, week,
      category: 'LABOUR', amount: money(labour), recordedAt: iso(addDays(cursor, 2)), synthetic: true,
    });
    f.actualCosts.push({
      id: `cst-${spec.projectId}-${weekIndex}-N`, projectId: spec.projectId, periodEnd: cursor, week,
      category: w.chance(0.7) ? 'NON_LABOUR' : 'PASS_THROUGH', amount: money(nonLabour),
      recordedAt: iso(addDays(cursor, 2)), synthetic: true,
    });

    // Progress claim — a recorded assertion, with who made it and on what basis.
    const planned = plannedProgressAt(weekIndex / spec.durationWeeks);
    if (!w.chance(dr.reportingGapChance)) {
      f.progressClaims.push({
        projectId: spec.projectId, claimedOn: cursor, week,
        physicalCompletion: dec(physical, 4), plannedCompletion: dec(planned, 4),
        basis: 'Completion criteria signed off per work package',
        claimedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, synthetic: true,
      });
    }

    // Quality: defects injected by volume of work, closed at a rate the archetype controls.
    const injected = Math.round((productiveHours / 100) * dr.defectInjectionPer100h * w.range(0.6, 1.4));
    for (let i = 0; i < injected; i += 1) {
      defectSeq += 1;
      const severity = w.chance(0.1) ? 'CRITICAL' : w.chance(0.35) ? 'MAJOR' : w.chance(0.7) ? 'MINOR' : 'TRIVIAL';
      const post = w.chance(0.22);
      const closes = w.chance(0.72);
      f.defects.push({
        id: `def-${spec.projectId}-${defectSeq}`, projectId: spec.projectId,
        severity, raisedOn: cursor,
        ...(closes ? { closedOn: addDays(cursor, w.int(3, 40)) } : {}),
        discoveryPhase: post ? 'POST_RELEASE' : 'PRE_RELEASE', escapedToClient: post,
        reopenCount: w.chance(dr.defectInjectionPer100h > 2 ? 0.28 : 0.06) ? w.int(1, 3) : 0,
        synthetic: true,
      });
      if (severity === 'CRITICAL' || severity === 'MAJOR') openMajorDefects += 1;
    }
    openMajorDefects = Math.max(0, Math.round(openMajorDefects * (dr.defectInjectionPer100h > 2 ? 0.86 : 0.7)));

    // Scope arrival → either an executed CR (commercially protected) or absorbed cost.
    const scopeValue = dr.scopeCreepPerWeek * contractValue;
    if (scopeValue > 500 && w.chance(0.55)) {
      const commercialised = w.chance(dr.scopeCommercialisationRate);
      const scopeId = `scp-${spec.projectId}-${weekIndex}`;
      f.scopeItems.push({
        id: scopeId, projectId: spec.projectId,
        description: 'Additional requirement requested by client',
        raisedOn: cursor, uncontracted: !commercialised,
        estimatedValue: money(scopeValue),
        synthetic: true,
      });
      if (commercialised) {
        const pendingId = `crp-${spec.projectId}-${weekIndex}`;
        f.pendingChanges.push({
          id: pendingId, contractId: spec.contractId, raisedOn: cursor,
          proposedValue: money(scopeValue), estimatedCost: money(scopeValue * 0.74),
          approvalProbability: dec(w.range(0.45, 0.9), 4),
          probabilityAssessedBy: `usr-com-${spec.projectId.slice(-3)}`,
          probabilityAssessedOn: addDays(cursor, 4), synthetic: true,
        });
        pendingValue += scopeValue;
        // Execution happens later, and only from the execution date forward.
        if (w.chance(0.6)) {
          const execOn = addDays(cursor, w.int(21, 63));
          if (compareDates(execOn, AS_OF) <= 0) {
            const execId = `crx-${spec.projectId}-${weekIndex}`;
            f.executedChanges.push({
              id: execId, contractId: spec.contractId, executedOn: execOn,
              valueDelta: money(scopeValue), costDelta: money(scopeValue * 0.74),
              contingencyDelta: money(scopeValue * 0.03), completionDateDelta: w.int(0, 14),
              executedFromPendingId: pendingId, synthetic: true,
            });
            // An executed change is an INSERT; the pending row keeps its own history.
            const held = f.pendingChanges.find((p) => p.id === pendingId);
            if (held) {
              f.pendingChanges[f.pendingChanges.indexOf(held)] = { ...held, supersededByExecutedId: execId };
            }
            executedValueDelta += scopeValue;
            executedCostDelta += scopeValue * 0.74;
            pendingValue -= scopeValue;
            f.baselineRevisions.push({
              id: `rev-${spec.projectId}-${weekIndex}`, contractId: spec.contractId,
              baselineKind: 'FORECAST', effectiveFrom: iso(execOn),
              actorId: `usr-dm-${spec.projectId.slice(-3)}`,
              reason: `Contractual baseline revised on execution of ${execId}`, synthetic: true,
            });
          }
        }
      } else {
        uncontractedValue += scopeValue;
      }
    }

    // ETC revision every six weeks. `etcOptimism` < 1 is what MET-FIN-030 later detects.
    if (weekIndex % 6 === 0) {
      const remaining = Math.max(0, 1 - physical);
      const honestEtc = remaining * hoursPerProgressPoint * drag * rate * 1.06;
      etcRecorded = honestEtc * dr.etcOptimism;
      committed = etcRecorded * w.range(0.05, 0.14);
      f.etcLineItems.push({
        projectId: spec.projectId, forecastRevisionId: `fcr-${spec.projectId}-${weekIndex}`, week,
        category: 'LABOUR', amount: money(etcRecorded * 0.88),
        basisOfEstimate: 'Bottom-up by work package, reviewed with delivery lead',
        estimatedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, estimatedOn: cursor, synthetic: true,
      });
      f.etcLineItems.push({
        projectId: spec.projectId, forecastRevisionId: `fcr-${spec.projectId}-${weekIndex}`, week,
        category: 'NON_LABOUR', amount: money(etcRecorded * 0.12),
        basisOfEstimate: 'Run-rate extrapolation of non-labour spend',
        estimatedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, estimatedOn: cursor, synthetic: true,
      });
      f.commitments.push({
        id: `cmt-${spec.projectId}-${weekIndex}`, projectId: spec.projectId,
        amount: money(committed), committedOn: cursor,
        expectedIncurBy: addDays(cursor, 90), cancellable: false,
        reference: `PO-${spec.projectId.slice(-3)}-${weekIndex}`, synthetic: true,
      });
    }

    // Contingency is drawn once cost runs ahead of the planned curve.
    const plannedCostToDate = planned * budgetedCost;
    if (costToDate > plannedCostToDate * 1.02 && contingencyConsumed < contingencyBudget) {
      const draw = Math.min(contingencyBudget - contingencyConsumed, contingencyBudget * dr.contingencyDrawPerWeek);
      if (draw > 1) {
        contingencyConsumed += draw;
        f.contingencyDrawdowns.push({
          projectId: spec.projectId, drawnOn: cursor, week, amount: money(draw),
          reason: 'Cost incurred ahead of baseline curve', authorisedByActorId: `usr-pd-${spec.projectId.slice(-3)}`,
          synthetic: true,
        });
      }
    }

    // Reported RAG (MET-HLTH-012) — the team's declaration. The generator works out what an honest
    // report would say, then applies the archetype's optimism. The gap between the two is what
    // MET-HLTH-030 later detects; the divergence is caused here, not asserted.
    if (weekIndex % 2 === 0) {
      const eac = costToDate + etcRecorded + committed;
      const forecastRevenue = contractValue + executedValueDelta;
      const gm = forecastRevenue > 0 ? (forecastRevenue - eac) / forecastRevenue : 0;
      gmHistory.push({ week, forecastGmPercent: gm });
      const soldGm = (contractValue - budgetedCost) / contractValue;
      const erosionPoints = (soldGm - gm) * 100;
      const honest = erosionPoints > 9 || physical < planned - 0.16 ? 'RED'
        : erosionPoints > 4 || physical < planned - 0.07 ? 'AMBER' : 'GREEN';
      const order = ['RED', 'AMBER', 'GREEN'] as const;
      const declaredIndex = Math.min(2, order.indexOf(honest) + dr.reportedRagOptimism);
      f.statusReports.push({
        projectId: spec.projectId, reportedOn: cursor, week,
        reportedRag: order[declaredIndex] as 'RED' | 'AMBER' | 'GREEN',
        commentary: 'Weekly delivery status submitted by the delivery manager',
        reportedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, synthetic: true,
      });
    }

    // Recognised revenue — an accounting fact produced by the documented synthetic policy and
    // stamped with it. Never derived from physical completion (Phase 2 closure, Decision 1).
    if (weekIndex % 4 === 0) {
      const eac = Math.max(1, costToDate + etcRecorded + committed);
      const contractual = contractValue + executedValueDelta;
      const target = contractual * Math.min(1, costToDate / eac);
      // One ORIGINAL posting per accounting period. Finance books a period once; a second figure for
      // the same period would be a correction, not another original. The period amount therefore
      // accrues across every tick inside the period — advancing the cumulative on a tick that
      // posts nothing would lose that increment entirely.
      //
      // RECOGNITION-v1 does not reverse: an upward ETC revision lowers the cost-to-cost ratio, and
      // real accounting does not claw back revenue already booked for that reason.
      const period = `${cursor.slice(0, 7)}`;
      if (period !== lastRecognisedPeriod) {
        const periodAmount = Math.max(0, target - cumulativeRecognised);
        cumulativeRecognised = Math.max(cumulativeRecognised, target);
        lastRecognisedPeriod = period;
        f.recognisedRevenue.push(originalPosting({
          projectId: spec.projectId, period, date: cursor, periodAmount,
          cumulative: cumulativeRecognised, currency, seq: weekIndex,
        }));
      }
    }

    cursor = addDays(cursor, 7);
    weekIndex += 1;
  }

  // --- risks ----------------------------------------------------------------
  const riskCount = rng.int(2, 7);
  for (let i = 0; i < riskCount; i += 1) {
    const includedInEtc = rng.chance(0.45);
    const causeKeys = ['CUSTOMER_ENV_DELAY', 'THIRD_PARTY_INTEGRATION', 'KEY_PERSON', 'REGULATORY_CHANGE', 'SCOPE_AMBIGUITY'];
    f.risks.push({
      id: `rsk-${spec.projectId}-${i + 1}`, projectId: spec.projectId,
      description: 'Identified delivery or commercial risk',
      severity: rng.chance(0.18) ? 'CRITICAL' : rng.chance(0.4) ? 'HIGH' : rng.chance(0.7) ? 'MEDIUM' : 'LOW',
      probability: dec(rng.range(0.1, 0.7), 4),
      costImpact: money(contractValue * rng.range(0.005, 0.05)),
      includedInEtc,
      ...(includedInEtc ? { includedInEtcJustification: 'Provisioned in the current bottom-up ETC line items' } : {}),
      riskCauseKey: rng.pick(causeKeys),
      proximityDate: addDays(AS_OF, rng.int(14, 180)),
      state: rng.chance(0.7) ? 'OPEN' : rng.chance(0.6) ? 'MITIGATING' : 'ACCEPTED',
      raisedOn: addDays(spec.startDate, rng.int(14, 120)),
      updatedAt: iso(addDays(AS_OF, -rng.int(1, 40))), synthetic: true,
    });
  }

  // --- accounting corrections (Correction 6) --------------------------------
  // Applied before billing so the billing series reflects the effective position.
  const corrected = applyCorrections(f.recognisedRevenue, spec.projectId, currency, masterSeed);
  f.recognisedRevenue.length = 0;
  f.recognisedRevenue.push(...corrected);

  // --- billing and cash -----------------------------------------------------
  const billing = buildBilling(spec.projectId, spec.contractId, currency, f.recognisedRevenue, masterSeed);
  f.invoices.push(...billing.invoices);
  f.payments.push(...billing.payments);

  // --- commercial exposure from absorbed scope ------------------------------
  if (uncontractedValue > 0) {
    f.exposures.push({
      projectId: spec.projectId, assessedOn: AS_OF, kind: 'UNCOMPENSATED_SCOPE',
      estimatedValue: money(uncontractedValue),
      estimationBasis: 'Estimated from delivered scope items with no linked executed change (estimate)',
      assessedByActorId: `usr-com-${spec.projectId.slice(-3)}`, synthetic: true,
    });
  }

  return {
    facts: f,
    trace: {
      weeks: f.progressClaims.length, costToDate, physicalCompletion: physical,
      plannedCompletion: plannedProgressAt(weekIndex / spec.durationWeeks),
      etcRecorded, committed, contingencyConsumed, reworkHours, totalHours,
      executedValueDelta, pendingValue, uncontractedValue, gmHistory,
    },
  };
}

export { plannedProgressAt };
