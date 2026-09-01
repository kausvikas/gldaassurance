/**
 * The semantic metric contract — integrity of the registry itself.
 *
 * `METRIC_CATALOG.md` §1.1 rule 2: "One definition, one implementation, one owner context. If two
 * contexts need the same metric, one owns it and the other consumes it. Duplicate implementations
 * are drift."
 *
 * This is the Phase 2 acceptance-gate half that asks: does a duplicate or conflicting definition
 * exist anywhere in the repository?
 */
import { describe, expect, it } from 'vitest';
import {
  METRIC_REGISTRY,
  METRIC_VERSION_HISTORY,
  RULE_SETS,
  TRAJECTORY_OBSERVATION_POLICIES,
  policiesForMetric,
  policyFor,
  findMetric,
  metricInputsOf,
  metricsOwnedBy,
  openCalibration,
  validateRegistry,
} from '@contexts/rules';

describe('registry integrity', () => {
  it('has no violations of any kind', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('covers every metric domain in the ID scheme', () => {
    const domains = new Set(METRIC_REGISTRY.map((m) => m.id.split('-')[1]));
    expect([...domains].sort()).toEqual(
      ['COM', 'DEL', 'DQ', 'FCST', 'FIN', 'HLTH', 'PORT', 'QUA', 'REC', 'RES', 'RSK'],
    );
  });

  it('assigns every metric exactly one owning context', () => {
    const contexts = [
      'financial', 'commercial', 'delivery', 'quality', 'resource',
      'risk', 'health', 'forecast', 'data-quality', 'recovery', 'portfolio',
    ];
    const counted = contexts.reduce((n, c) => n + metricsOwnedBy(c).length, 0);
    expect(counted).toBe(METRIC_REGISTRY.length);
  });

  it('gives every metric an ID, a name, a formula and a business definition', () => {
    for (const m of METRIC_REGISTRY) {
      expect(m.id, m.name).toMatch(/^MET-[A-Z]+-\d{3}$/);
      expect(m.name.length, m.id).toBeGreaterThan(3);
      expect(m.formula.length, m.id).toBeGreaterThan(3);
      // The property that matters is not length but kind: a business definition must read as a
      // sentence a controller would accept, and must not merely restate the formula. Padding a
      // correct one-line definition ("Number of open risks rated critical.") would make it worse.
      expect(m.businessDefinition, m.id).toMatch(/\.$/);
      expect(m.businessDefinition.trim().split(/\s+/).length, m.id).toBeGreaterThanOrEqual(4);
      expect(m.businessDefinition, `${m.id} restates its formula instead of defining it`)
        .not.toBe(m.formula);
      expect(m.businessDefinition, `${m.id} uses metric IDs where prose is required`)
        .not.toMatch(/MET-[A-Z]+-\d{3}/);
    }
  });

  it('declares every field the Phase 2 brief requires on a metric definition', () => {
    const required = [
      'id', 'name', 'businessDefinition', 'formula', 'inputs', 'unit', 'sourceDomain', 'owner',
      'aggregation', 'currencyBehaviour', 'edgeHandling', 'applicableContractTypes',
      'effectiveFrom', 'version', 'evidenceExpectations',
    ];
    for (const m of METRIC_REGISTRY) {
      for (const field of required) {
        expect(Object.hasOwn(m, field), `${m.id} is missing "${field}"`).toBe(true);
      }
    }
  });
});

describe('layering (ADR-0004)', () => {
  it('assigns every metric exactly one epistemic layer', () => {
    for (const m of METRIC_REGISTRY) expect(['L1_OBSERVED', 'L2_DERIVED', 'L3_ASSESSED']).toContain(m.epistemicLevel);
  });

  it('never lets an L1 fact depend on a derived metric — a fact does not know its own score', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.epistemicLevel === 'L1_OBSERVED')) {
      for (const input of metricInputsOf(m)) {
        const dep = findMetric(input);
        // MET-DEL-003 is an explicit alias of MET-FIN-005, itself L1.
        expect(dep?.epistemicLevel, `${m.id} depends on ${input}`).toBe('L1_OBSERVED');
      }
    }
  });

  it('classifies every forecast metric as L3 inferred (ADR-0011, CONFLICT C-2)', () => {
    const forecast = metricsOwnedBy('forecast');
    expect(forecast.length).toBeGreaterThan(6);
    for (const m of forecast) expect(m.epistemicLevel, m.id).toBe('L3_ASSESSED');
  });

  it('keeps the flagship divergence signal out of the composite it would be averaged into', () => {
    const composite = findMetric('MET-HLTH-010');
    expect(metricInputsOf(composite!)).not.toContain('MET-HLTH-030');
    expect(findMetric('MET-HLTH-030')?.notes).toMatch(/never be averaged/);
  });

  it('keeps health and confidence a tuple, never a product (PRODUCT_SPEC §3.4)', () => {
    const dq6 = findMetric('MET-DQ-006');
    expect(dq6?.unit).toBe('Tuple');
    expect(dq6?.formula).toMatch(/tuple, never a product/);
  });
});

describe('governance properties', () => {
  it('names a baseline on every variance metric (§1.1 rule 6)', () => {
    const variances = METRIC_REGISTRY.filter((m) =>
      /variance|erosion|drift|delta|at risk/i.test(m.name),
    );
    expect(variances.length).toBeGreaterThan(8);
    for (const m of variances) expect(m.baseline, `${m.id} (${m.name})`).toBeDefined();
  });

  it('records a change reason for every version bump (global invariant 3)', () => {
    for (const v of METRIC_VERSION_HISTORY) {
      expect(v.changeReason.length, `${v.metricId}@${v.version}`).toBeGreaterThan(30);
    }
  });

  it('records both the old and new EAC formula, so the change is visible not silent', () => {
    const eac = METRIC_VERSION_HISTORY.filter((v) => v.metricId === 'MET-FIN-008');
    expect(eac).toHaveLength(2);
    expect(eac[0]?.formula).toBe('MET-FIN-005 + MET-FIN-007');
    expect(eac[1]?.formula).toBe('MET-FIN-005 + MET-FIN-007 + MET-FIN-023');
    expect(eac[1]?.supersedes).toBe('1.0.0');
    expect(findMetric('MET-FIN-008')?.version).toBe('2.0.0');
  });

  it('marks every metric that claims to be BLOCKED as Draft, not Frozen', () => {
    const blocked = METRIC_REGISTRY.filter((m) => /BLOCKED by/.test(m.notes ?? ''));
    // Three remain: MC-8 leaves the scope unit undefined (MET-DEL-012, MET-QUA-002) and C-9 leaves
    // it open whether the seven-factor profile supersedes the frozen forecast-confidence number
    // (MET-DQ-009). C-7 was the largest block and is resolved at Phase 7 closure (ADR-0015 D-1,
    // amended), so the sixteen metrics it held are Frozen — the invariant is that a metric may not
    // claim to be blocked and be Frozen at the same time, whatever the count.
    expect(blocked.map((m) => m.id).sort()).toEqual(['MET-DEL-012', 'MET-DQ-009', 'MET-QUA-002']);
    for (const m of blocked) expect(m.status, `${m.id} claims BLOCKED but is ${m.status}`).toBe('Draft');
  });

  it('states evidence expectations on every metric, so AC-3 is answerable', () => {
    for (const m of METRIC_REGISTRY) {
      expect(m.evidenceExpectations.length, m.id).toBeGreaterThan(0);
    }
  });

  it('restricts fixed-bid-only metrics to fixed-bid contracts', () => {
    // Unsecured upside and uncompensated scope are meaningless where scope risk sits with the client.
    for (const id of ['MET-FIN-011', 'MET-COM-009', 'MET-COM-010', 'MET-FIN-035']) {
      expect(findMetric(id)?.applicableContractTypes, id).toEqual(['FIXED_BID']);
    }
  });
});

describe('the catalog cannot silently diverge from the registry', () => {
  it('is the single source of definitions — 137 metrics, one entry each', () => {
    expect(METRIC_REGISTRY.length).toBe(new Set(METRIC_REGISTRY.map((m) => m.id)).size);
    expect(METRIC_REGISTRY.length).toBeGreaterThan(130);
  });
});

describe('Phase 2 closure — epistemic level and authoritative source (Decisions 6, 7)', () => {
  it('declares both on every metric', () => {
    for (const m of METRIC_REGISTRY) {
      expect(['L1_OBSERVED', 'L2_DERIVED', 'L3_ASSESSED'], m.id).toContain(m.epistemicLevel);
      expect(m.authoritativeSourceType, m.id).toBeTruthy();
    }
  });

  it('never lets an observed fact claim Delivery Intelligence as its authority', () => {
    // This is the check that makes "we do not invent the accounting ledger" structural.
    for (const m of METRIC_REGISTRY.filter((x) => x.epistemicLevel === 'L1_OBSERVED')) {
      expect(['DERIVED', 'RULE_ENGINE'], m.id).not.toContain(m.authoritativeSourceType);
    }
  });

  it('routes recognised revenue to Finance, not to a Delivery Intelligence calculation (OQ-2)', () => {
    for (const id of ['MET-FIN-009', 'MET-FIN-039']) {
      const m = findMetric(id);
      expect(m?.epistemicLevel, id).toBe('L1_OBSERVED');
      expect(m?.authoritativeSourceType, id).toBe('FINANCE_SYSTEM');
      expect(m?.formula, id).toMatch(/imported fact/);
    }
    // And it must not be derived from physical completion or from the implied EAC.
    const rec = findMetric('MET-FIN-009');
    expect(rec?.inputs).not.toContain('MET-DEL-016');
    expect(rec?.inputs).not.toContain('MET-FIN-029');
    expect(rec?.inputs).not.toContain('MET-FIN-006');
  });

  it('classifies a representative L1, L2 and L3 metric correctly', () => {
    expect(findMetric('MET-FIN-005')?.epistemicLevel).toBe('L1_OBSERVED');   // actual cost
    expect(findMetric('MET-HLTH-012')?.epistemicLevel).toBe('L1_OBSERVED');  // reported RAG
    expect(findMetric('MET-FIN-024')?.epistemicLevel).toBe('L2_DERIVED');    // forecast GM
    expect(findMetric('MET-FIN-027')?.epistemicLevel).toBe('L2_DERIVED');    // burn gap
    expect(findMetric('MET-FIN-029')?.epistemicLevel).toBe('L2_DERIVED');    // performance-implied EAC
    expect(findMetric('MET-FCST-001')?.epistemicLevel).toBe('L3_ASSESSED');  // trajectory
    expect(findMetric('MET-DQ-007')?.epistemicLevel).toBe('L3_ASSESSED');    // forecast confidence
  });

  it('keeps a deterministic implementation from making an assessment L2', () => {
    // ADR-0011 / Decision 6: epistemic level is about meaning, not determinism.
    const traj = findMetric('MET-FCST-001');
    expect(traj?.epistemicLevel).toBe('L3_ASSESSED');
    expect(traj?.formula).toMatch(/least-squares/); // entirely deterministic, still an assessment
  });
});

describe('Phase 2 closure — metric versus calibration (Decisions 8, 9)', () => {
  it('leaves no metric Draft merely because a threshold is undecided', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.status === 'Draft')) {
      expect(m.notes ?? '', `${m.id} is Draft without naming a Type A semantic gap`).toMatch(/Type A/i);
      expect(m.notes ?? '', `${m.id} is Draft without naming an owner`).toMatch(/Owner:/);
    }
  });

  /**
   * The list is exhaustive on purpose. A Draft metric that nobody listed here is a metric whose
   * meaning is unsettled and which nobody is tracking, and that is precisely the state this control
   * exists to make loud. Adding a Draft means editing this line and saying why.
   */
  it('holds exactly the expected Draft metrics, all blocked on a genuine semantic gap', () => {
    const draft = METRIC_REGISTRY.filter((m) => m.status === 'Draft').map((m) => m.id).sort();
    expect(draft).toEqual([
      // Phase 2: MC-8 — the scope unit is undefined, so "how much scope is done" has no meaning
      // to compute yet. Owner: Delivery leadership + the Phase 2 metric owner.
      'MET-DEL-012',
      // Phase 4, CONFLICT C-9 / ADR-0015 D-3 — acceptance must decide whether the seven-factor
      // profile supersedes the frozen MET-DQ-007, sits beside it, or is withdrawn.
      'MET-DQ-009',
      'MET-QUA-002',
    ]);
  });

  it('carries open calibration as named, owned parameters rather than as blocked metrics', () => {
    const open = openCalibration();
    expect(open.length).toBeGreaterThan(20);
    for (const p of open) {
      // C-7 and C-9 are Phase 4 conflict IDs; a parameter blocked on an unresolved conflict is
      // still a named, owned parameter, which is what this control is actually asserting.
      expect(p.blockedBy, `${p.ruleSet}.${p.parameter}`).toMatch(/MC-\d|OQ-\d|C-\d|POLICY/);
      expect(p.blockedBy, `${p.ruleSet}.${p.parameter} names no owner`).toMatch(/owner:/);
    }
  });

  it('has already settled the weekly-signal default window that ADR-0003 decides', () => {
    const traj = RULE_SETS.find((r) => r.id === 'TRAJECTORY');
    const window = traj?.parameters.find((p) => p.name === 'defaultWeeklySignalWindowWeeks');
    expect(window?.value).toBe('8');
    expect(window?.blockedBy).toBeUndefined();
  });

  it('does not carry a globally-named trajectory window (Correction 2)', () => {
    // The old name invited reading 8 weeks as *the* definition of trajectory for every signal.
    for (const rs of RULE_SETS) {
      for (const p of rs.parameters) expect(p.name).not.toBe('trajectoryWindowWeeks');
    }
  });
});

describe('Phase 2 closure — dependency purity (Step 5)', () => {
  it('has no Frozen metric depending on a Draft one', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.status === 'Frozen')) {
      for (const input of metricInputsOf(m)) {
        expect(findMetric(input)?.status, `${m.id} -> ${input}`).not.toBe('Draft');
      }
    }
  });

  it('has no L1 or L2 metric depending on an L3 assessment', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.epistemicLevel !== 'L3_ASSESSED')) {
      for (const input of metricInputsOf(m)) {
        expect(findMetric(input)?.epistemicLevel, `${m.id} (${m.epistemicLevel}) -> ${input}`)
          .not.toBe('L3_ASSESSED');
      }
    }
  });
});

describe('Phase 2 closure — revenue concepts stay separated (Decisions 2, 11)', () => {
  it('keeps six revenue-adjacent concepts as six distinct metrics', () => {
    const concepts: [string, string, string][] = [
      ['MET-FIN-002', 'Contractual Revenue', 'L2_DERIVED'],
      ['MET-FIN-010', 'Forecast Revenue', 'L2_DERIVED'],
      ['MET-FIN-009', 'Recognised Revenue', 'L1_OBSERVED'],
      ['MET-FIN-039', 'Recognised Revenue', 'L1_OBSERVED'],
      ['MET-COM-001', 'Invoiced', 'L1_OBSERVED'],
      ['MET-COM-002', 'Collected', 'L1_OBSERVED'],
    ];
    for (const [id, fragment, level] of concepts) {
      const m = findMetric(id);
      expect(m?.name, id).toContain(fragment);
      expect(m?.epistemicLevel, id).toBe(level);
    }
    // Pending CR recovery is two distinct things and neither is base revenue.
    expect(findMetric('MET-FIN-011')?.name).toBe('Unsecured Upside');
    expect(findMetric('MET-COM-010')?.name).toBe('Expected Pending CR Recovery');
  });

  it('keeps pending CR recovery out of base forecast revenue', () => {
    expect(findMetric('MET-FIN-010')?.inputs).not.toContain('MET-COM-010');
    expect(findMetric('MET-FIN-010')?.inputs).not.toContain('MET-FIN-011');
    // It reaches only the risk-adjusted scenario.
    expect(findMetric('MET-FIN-031')?.inputs).toContain('MET-COM-010');
  });

  it('states plainly that billing and cash are not revenue', () => {
    expect(findMetric('MET-COM-001')?.businessDefinition).toMatch(/not revenue/);
    expect(findMetric('MET-COM-002')?.businessDefinition).toMatch(/neither revenue nor billing/);
  });

  it('stops Performance-Implied EAC being read as a recognition method (Decision 3)', () => {
    const m = findMetric('MET-FIN-029');
    expect(m?.businessDefinition).toMatch(/extrapolative diagnostic/);
    expect(m?.notes).toMatch(/accounting revenue-recognition method/);
    expect(m?.notes).toMatch(/the official EAC/);
  });
});


describe('Phase 3 correction — trajectory observation policies are signal-specific (Correction 2)', () => {
  it('defines a policy per signal, not one window for everything', () => {
    expect(TRAJECTORY_OBSERVATION_POLICIES.length).toBeGreaterThanOrEqual(8);
    const types = new Set(TRAJECTORY_OBSERVATION_POLICIES.map((p) => p.windowType));
    // If every signal used the same window type, the seam would be decorative.
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('gives every policy the full contract: window, minimum observations, weighting, version', () => {
    for (const p of TRAJECTORY_OBSERVATION_POLICIES) {
      expect(p.signalId, 'signalId').toBeTruthy();
      expect(['ROLLING_WEEK', 'REPORTING_PERIOD', 'LAST_N_EVENTS', 'CUMULATIVE_PLUS_RECENT', 'AGE_AND_TREND'])
        .toContain(p.windowType);
      expect(p.windowSize, p.signalId).toBeGreaterThan(0);
      expect(p.minimumObservations, p.signalId).toBeGreaterThan(0);
      expect(p.minimumObservations, p.signalId).toBeLessThanOrEqual(p.windowSize);
      expect(['NONE', 'LINEAR', 'EXPONENTIAL']).toContain(p.recencyWeighting);
      expect(p.applicability.length, p.signalId).toBeGreaterThan(0);
      expect(p.version, p.signalId).toBe('TRAJECTORY-v1');
      expect(p.rationale.length, p.signalId).toBeGreaterThan(40);
    }
  });

  it('does not apply a rolling weekly window to figures restated per reporting period', () => {
    // Forecast GM and EAC revisions are period events. A weekly slope over them is noise.
    for (const signalId of ['FORECAST_GM_TREND', 'EAC_REVISION_TREND', 'SCOPE_EXPOSURE_TREND']) {
      expect(policyFor(signalId)?.windowType, signalId).toBe('REPORTING_PERIOD');
    }
    // Milestones are events on an irregular cadence.
    expect(policyFor('MILESTONE_HIT_RATE')?.windowType).toBe('LAST_N_EVENTS');
    // For an unexecuted CR, the age is the signal.
    expect(policyFor('CR_EXPOSURE')?.windowType).toBe('AGE_AND_TREND');
    // Contingency needs both level and rate.
    expect(policyFor('CONTINGENCY_CONSUMPTION')?.windowType).toBe('CUMULATIVE_PLUS_RECENT');
  });

  it('keeps the rolling weekly window only for signals that genuinely move weekly', () => {
    for (const signalId of ['DELIVERY_VELOCITY', 'HEALTH_TRAJECTORY', 'QUALITY_REWORK_TREND']) {
      expect(policyFor(signalId)?.windowType, signalId).toBe('ROLLING_WEEK');
    }
  });

  /**
   * An observation policy says how a **signal's time series** is sampled — window type, window
   * size, minimum observations. Every forecast metric that is a per-project signal needs one.
   *
   * `MET-FCST-030` Late Detection Rate is the one exemption, and it is exempt because it is not a
   * signal: it is a portfolio KPI computed once over a *population of projects*, with no trailing
   * window to sample. Its `minimumHistoryWeeks` refers to the health history it reads, not to a
   * series of its own. The exemption is named here rather than the rule being loosened, so adding a
   * second one is a deliberate edit somebody has to justify.
   */
  const POLICY_EXEMPT = new Set(['MET-FCST-030']);

  it('maps every trajectory signal metric to at least one policy', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.sourceDomain === 'forecast')) {
      if (POLICY_EXEMPT.has(m.id)) continue;
      expect(policiesForMetric(m.id).length, `${m.id} has no observation policy`).toBeGreaterThan(0);
    }
  });

  it('exempts only metrics that are genuinely not time series', () => {
    for (const id of POLICY_EXEMPT) {
      const m = METRIC_REGISTRY.find((x) => x.id === id);
      expect(m, id).toBeDefined();
      // A population measure, not a per-project signal: it aggregates across projects.
      expect(m?.aggregation, id).toBe('WEIGHTED_MEAN');
      expect(m?.formula, id).toMatch(/count\(project/);
    }
  });
});
