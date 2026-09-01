/**
 * Renders `METRIC_CATALOG.md` from the metric registry.
 *
 * The catalog is *generated*, not hand-maintained. `METRIC_CATALOG.md` §1.1 rule 2 requires one
 * definition per metric; the surest way to honour that is for the document and the code to be the
 * same artifact seen twice. `tests/integration/metric-catalog.test.ts` regenerates and compares, so
 * an edit to either side that is not mirrored in the other fails the build.
 */
import type { MetricDefinition, MetricVersionRecord } from '@contexts/rules';

const DOMAIN_SECTIONS: readonly { readonly code: string; readonly title: string; readonly context: string }[] = [
  { code: 'FIN', title: 'Financial', context: 'financial' },
  { code: 'COM', title: 'Commercial', context: 'commercial' },
  { code: 'DEL', title: 'Delivery & earned value', context: 'delivery' },
  { code: 'QUA', title: 'Quality & engineering', context: 'quality' },
  { code: 'RES', title: 'Resource & people', context: 'resource' },
  { code: 'RSK', title: 'Risk', context: 'risk' },
  { code: 'HLTH', title: 'Health & RAG', context: 'health' },
  { code: 'FCST', title: 'Forecast & trajectory', context: 'forecast' },
  { code: 'DQ', title: 'Data quality & confidence', context: 'data-quality' },
  { code: 'PORT', title: 'Portfolio aggregates', context: 'portfolio' },
];

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function renderMetric(m: MetricDefinition): string {
  const lines: string[] = [];
  lines.push(`#### ${m.id} — ${m.name}`);
  lines.push('');
  lines.push(m.businessDefinition);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Formula | \`${esc(m.formula)}\` |`);
  lines.push(`| Inputs | ${m.inputs.length ? m.inputs.map((i) => `\`${i}\``).join(', ') : '—'} |`);
  lines.push(`| Unit | ${m.unit} |`);
  lines.push(`| Epistemic level | ${m.epistemicLevel} |`);
  lines.push(`| Authoritative source | ${m.authoritativeSourceType} |`);
  lines.push(`| Owner context | \`${m.sourceDomain}\` |`);
  lines.push(`| Definition owner | ${m.owner} |`);
  lines.push(`| Aggregation | ${m.aggregation} |`);
  lines.push(`| Currency behaviour | ${m.currencyBehaviour} |`);
  lines.push(`| Baseline | ${m.baseline ?? '—'} |`);
  lines.push(
    `| Zero denominator | ${m.edgeHandling.zeroDenominator} |`,
  );
  lines.push(`| Missing input | ${m.edgeHandling.missingInput} |`);
  lines.push(
    `| Minimum history | ${m.edgeHandling.minimumHistoryWeeks === 0 ? 'none' : `${m.edgeHandling.minimumHistoryWeeks} weekly snapshots`} |`,
  );
  if (m.edgeHandling.precondition) lines.push(`| Precondition | ${esc(m.edgeHandling.precondition)} |`);
  lines.push(`| Contract types | ${m.applicableContractTypes.join(', ')} |`);
  lines.push(`| Rule set | ${m.ruleSet ?? '—'} |`);
  lines.push(`| Effective from | ${m.effectiveFrom} |`);
  lines.push(`| Version | ${m.version} |`);
  lines.push(`| Status | \`${m.status}\` |`);
  lines.push(`| Evidence expected | ${m.evidenceExpectations.map(esc).join('; ')} |`);
  lines.push('');
  if (m.notes) {
    lines.push(`> ${esc(m.notes)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderCatalog(
  registry: readonly MetricDefinition[],
  versions: readonly MetricVersionRecord[],
  refinements: readonly { id: string; change: string }[],
): string {
  const out: string[] = [];
  const draft = registry.filter((m) => m.status === 'Draft');

  out.push('# METRIC_CATALOG.md — Authoritative Metric & Formula Definitions');
  out.push('');
  out.push('**Status:** Phase 2 — definitions populated. **Not yet fully `Frozen`;** see §14.');
  out.push('**Version:** 2.0.0');
  out.push('**Classification:** Internal — DEMO / SYNTHETIC DATA');
  out.push('');
  out.push('> ⚠️ **This file is generated from the metric registry at**');
  out.push('> `src/contexts/rules/internal/registry/`. **Do not edit it by hand** — an edit here');
  out.push('> that is not mirrored in the registry fails `tests/integration/metric-catalog.test.ts`.');
  out.push('> Regenerate with `npm run catalog:generate`.');
  out.push('');
  out.push('---');
  out.push('');
  out.push('## 1. Catalog governance');
  out.push('');
  out.push('### 1.1 The rules that make this file work');
  out.push('');
  out.push('1. **Every number displayed anywhere in the product has a metric ID from this catalog.** A number on a screen with no ID is a defect (`PRODUCT_SPEC.md` §8.1).');
  out.push('2. **One definition, one implementation, one owner context.** Enforced by `validateRegistry()`, which fails on a duplicate ID or a duplicate formula-and-input pair.');
  out.push('3. **Formulas change only by version bump + a recorded reason.** §13 is the change log; it is asserted non-empty by test.');
  out.push('4. **Every metric declares its epistemic level and its authoritative source.** `L1_OBSERVED` / `L2_DERIVED` / `L3_ASSESSED` describes what kind of claim the value is, not whether its implementation is deterministic (ADR-0004, ADR-0011). A metric may not be registered without both.');
  out.push('10. **Delivery Intelligence is authoritative only for `DERIVED` and `RULE_ENGINE` values.** Everything else is consumed from the system that owns it — most importantly, Recognised Revenue is a Finance/ERP accounting fact, never a Delivery Intelligence calculation (Phase 2 closure, Decision 1).');
  out.push('5. **Every quotient declares its zero-denominator behaviour.** `NOT_COMPUTABLE` is a first-class result state, distinct from zero and from null. Never `NaN`, never `Infinity`, never a silent dash.');
  out.push('6. **Every variance names its baseline** (As-Sold / Current Contractual / Forecast / Recovery). A variance without a named baseline is a defect (ADR-0003).');
  out.push('7. **Every monetary metric carries a currency** and, if converted, the FX rate and rate date (ADR-0002).');
  out.push('8. **Aggregate metrics are computed over the caller\'s authorised entity set** (ADR-0005 §5).');
  out.push('9. **Rounding is presentation-only**, half-up, with largest-remainder allocation where parts must sum to a whole (ADR-0002 §5).');
  out.push('');
  out.push('### 1.2 Metric ID scheme');
  out.push('');
  out.push('`MET-<DOMAIN>-<NNN>` — domains: ' + DOMAIN_SECTIONS.map((d) => `\`${d.code}\` ${d.title.toLowerCase()}`).join(' · ') + '.');
  out.push('');
  out.push('**IDs are permanent.** A retired metric keeps its ID and is marked `Retired`. Never reuse.');
  out.push('');
  out.push('### 1.3 Status lifecycle');
  out.push('');
  out.push('| Status | Meaning |');
  out.push('| --- | --- |');
  out.push('| `Draft` | Definition may still change; blocked on an open question |');
  out.push('| `Frozen` | Confirmed; changes require a version bump and a recorded reason |');
  out.push('| `Implemented` | Frozen and covered by passing golden tests (Phase 4) |');
  out.push('| `Retired` | No longer computed; ID retained, superseding metric named |');
  out.push('');
  out.push('### 1.4 Notation');
  out.push('');
  out.push('`AS` = Original As-Sold Baseline · `CC` = Current Contractual Baseline · `FC` = Current Forecast · `ATD` = Actual to Date · `t` = as-of date.');
  out.push('');
  out.push('### 1.5 Summary');
  out.push('');
  out.push('| | Count |');
  out.push('| --- | --- |');
  out.push(`| Metrics defined | **${registry.length}** |`);
  out.push(`| \`Frozen\` | ${registry.filter((m) => m.status === 'Frozen').length} |`);
  out.push(`| \`Draft\` (blocked — see §14) | ${draft.length} |`);
  for (const level of ['L1_OBSERVED', 'L2_DERIVED', 'L3_ASSESSED'] as const) {
    out.push(`| ${level} | ${registry.filter((m) => m.epistemicLevel === level).length} |`);
  }
  out.push('');
  out.push('| Authoritative source | Count |');
  out.push('| --- | --- |');
  for (const src of [...new Set(registry.map((m) => m.authoritativeSourceType))].sort()) {
    out.push(`| ${src} | ${registry.filter((m) => m.authoritativeSourceType === src).length} |`);
  }
  out.push('');
  out.push('---');
  out.push('');

  // Index
  out.push('## 2. Index');
  out.push('');
  out.push('| ID | Metric | Epistemic level | Authoritative source | Unit | Owner context | Status |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of registry) {
    out.push(`| ${m.id} | ${esc(m.name)} | ${m.epistemicLevel} | ${m.authoritativeSourceType} | ${m.unit} | \`${m.sourceDomain}\` | \`${m.status}\` |`);
  }
  out.push('');
  out.push('---');
  out.push('');

  // Per-domain sections
  let section = 3;
  for (const d of DOMAIN_SECTIONS) {
    const metrics = registry.filter((m) => m.id.split('-')[1] === d.code);
    if (metrics.length === 0) continue;
    out.push(`## ${section}. ${d.title} (\`${d.context}\` context)`);
    out.push('');
    for (const m of metrics) out.push(renderMetric(m));
    out.push('---');
    out.push('');
    section += 1;
  }

  // Change log
  out.push(`## ${section}. Definition change log`);
  out.push('');
  out.push('Global invariant 3 forbids changing a formula *silently*. `METRIC_CATALOG.md` §1.3 permits a `Draft` definition to change in Phase 2 — this is the record of every one that did.');
  out.push('');
  out.push('### Version bumps');
  out.push('');
  out.push('| Metric | Version | Effective | Formula | Reason |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const v of versions) {
    out.push(`| ${v.metricId} | ${v.version}${v.supersedes ? ` (supersedes ${v.supersedes})` : ''} | ${v.effectiveFrom} | \`${esc(v.formula)}\` | ${esc(v.changeReason)} |`);
  }
  out.push('');
  out.push('### Wording refinements without a version bump');
  out.push('');
  out.push('| Metric | Change |');
  out.push('| --- | --- |');
  for (const r of refinements) out.push(`| ${r.id} | ${esc(r.change)} |`);
  out.push('');
  section += 1;

  // Blocked items
  out.push(`## ${section}. Open items blocking the freeze`);
  out.push('');
  out.push(`**${draft.length} of ${registry.length} metrics remain \`Draft\`.** The catalog cannot be declared \`Frozen\` while any of these is open. Escalate rather than assume — an assumed formula that reaches Phase 9 is a formula nobody will question again.`);
  out.push('');
  out.push('| Metric | Blocked by |');
  out.push('| --- | --- |');
  for (const m of draft) {
    const reason = /BLOCKED by ([^.]+)/.exec(m.notes ?? '')?.[1]
      ?? (m.ruleSet ? `${m.ruleSet} parameters not yet calibrated` : 'depends on a Draft metric');
    out.push(`| ${m.id} ${esc(m.name)} | ${esc(reason)} |`);
  }
  out.push('');
  return out.join('\n') + '\n';
}
