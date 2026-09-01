/**
 * Provenance and evidence — the components that make AC-3 legible.
 *
 * AC-3: *"Every headline number can be drilled to the L1 facts that produced it, in ≤3 steps,
 * without leaving the product."* That is a UI obligation, and `BRAND_DESIGN_SYSTEM.md` §3.3 states
 * how it must look: facts undecorated, derived values dotted-underlined with their formula reachable,
 * inferences **contained** in a bordered blue panel with an explicit chip.
 *
 * Containment is the load-bearing part. An inference that renders like a fact is a provenance
 * failure (§8 prohibition 7), and the failure is invisible in review because it looks fine — it just
 * quietly tells an executive that a model's opinion is an observation.
 *
 * `EvidenceDisclosure` is built on `<details>`/`<summary>` rather than a JavaScript popover, for a
 * reason that outlives this phase: it is keyboard-operable, screen-reader-announced and printable
 * with no client-side state at all. A later phase may animate it; it may not make it depend on JS to
 * be reachable.
 */
import type { JSX, ReactNode } from 'react';
import { formatInstant } from './rich-text.js';
import type {
  EvidenceViewModel, MetricViewModel, ProvenanceTreatment,
} from '../view-models.js';
import { RESTRICTED_LABEL } from '../view-models.js';

const TREATMENT_CLASS: Readonly<Record<ProvenanceTreatment, string>> = {
  fact: 'gl-prov-fact',
  computed: 'gl-prov-computed',
  inferred: 'gl-prov-inferred',
};

const TREATMENT_TITLE: Readonly<Record<ProvenanceTreatment, string>> = {
  fact: 'Observed fact',
  computed: 'Derived metric — computed from facts by a versioned rule',
  inferred: 'Inferred — a model estimate, not an observation',
};

/**
 * A value wearing its epistemic layer.
 *
 * `fact` and `computed` are inline; `inferred` is a block, because §3.3 requires containment and a
 * containing element that flows inline is not containment.
 */
export function ProvenanceValue(
  { treatment, children, srHint = true }: {
    readonly treatment: ProvenanceTreatment;
    readonly children: ReactNode;
    readonly srHint?: boolean;
  },
): JSX.Element {
  if (treatment === 'inferred') {
    return (
      <div className={TREATMENT_CLASS.inferred}>
        <div className="gl-row" style={{ justifyContent: 'space-between', marginBottom: 'var(--gl-space-xxs)' }}>
          <span className="gl-chip gl-chip-analytic">
            <span className="gl-chip-glyph" aria-hidden="true">◈</span>
            <span>Inferred</span>
          </span>
        </div>
        {children}
      </div>
    );
  }
  return (
    <span className={TREATMENT_CLASS[treatment]} title={TREATMENT_TITLE[treatment]}>
      {children}
      {srHint ? <span className="gl-visually-hidden">{` (${TREATMENT_TITLE[treatment]})`}</span> : null}
    </span>
  );
}

/** The neutral chip an unauthorised field leaves behind. It discloses nothing (SECURITY_MODEL §4.5). */
export function RestrictedValue(): JSX.Element {
  return (
    <span className="gl-chip gl-restricted">
      <span className="gl-chip-glyph" aria-hidden="true">🔒</span>
      <span>{RESTRICTED_LABEL}</span>
    </span>
  );
}

/**
 * The evidence drawer.
 *
 * Renders the chain a reader needs to defend or challenge a number: the inputs, each labelled with
 * its own epistemic layer, plus the rule version and the sources. Nothing here is computed — the
 * lines arrive formatted, which is what keeps "show your working" from becoming "recompute in the
 * browser and hope it matches".
 */
export function EvidenceDisclosure(
  { evidence, label = 'Show evidence', open = false }: {
    readonly evidence: EvidenceViewModel;
    readonly label?: string;
    readonly open?: boolean;
  },
): JSX.Element {
  return (
    <details className="gl-evidence" open={open}>
      <summary className="gl-chip gl-chip-neutral">
        <span className="gl-chip-glyph" aria-hidden="true">▸</span>
        <span>{label}</span>
      </summary>
      <div className="gl-evidence-panel">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-xs)' }}>
          <div>
            <div className="gl-card-title">{evidence.title}</div>
            <div className="gl-caption">
              {[
                evidence.metricId,
                evidence.ruleVersion !== undefined ? `rule ${evidence.ruleVersion}` : undefined,
                evidence.computedAt !== undefined ? `computed ${formatInstant(evidence.computedAt)}` : undefined,
              ].filter((x): x is string => x !== undefined).join(' · ')}
            </div>
          </div>
          <div>
            {evidence.lines.map((line) => (
              <div className="gl-evidence-row" key={line.label}>
                <span className="gl-body-sm">{line.label}</span>
                <span className="gl-body-sm gl-numeric">
                  {line.treatment !== undefined
                    ? <ProvenanceValue treatment={line.treatment} srHint={false}>{line.value}</ProvenanceValue>
                    : line.value}
                </span>
              </div>
            ))}
          </div>
          {evidence.sources.length > 0
            ? (
              <div className="gl-caption">
                {`Sources: ${evidence.sources.join(', ')}`}
              </div>
            )
            : null}
        </div>
      </div>
    </details>
  );
}

/** A metric with its label, value, treatment and — where supplied — its evidence chain. */
export function MetricValue(
  { metric, evidence }: {
    readonly metric: MetricViewModel;
    readonly evidence?: EvidenceViewModel;
  },
): JSX.Element {
  return (
    <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
      <span className="gl-caption">{metric.label}</span>
      <span className="gl-numeric gl-body">
        <ProvenanceValue treatment={metric.treatment}>{metric.display}</ProvenanceValue>
      </span>
      {evidence !== undefined ? <EvidenceDisclosure evidence={evidence} /> : null}
    </div>
  );
}
