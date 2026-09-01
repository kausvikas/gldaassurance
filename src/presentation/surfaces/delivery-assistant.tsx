/**
 * The Delivery Intelligence Assistant surface (Phase 11B).
 *
 * **It computes nothing and it introduces no visual convention.** Every element is a Phase 6
 * primitive, every string arrives pre-formatted from `@app`, and the G-FLOAT gate over
 * `src/presentation` would reject any arithmetic here.
 *
 * ## Why it does not look like a chatbot
 *
 * A chat bubble implies a conversation with something that knows things. This product's assistant
 * *reads governed assessments and says what they say* - so the surface is laid out as a briefing,
 * in the order an executive actually needs:
 *
 * | Band | What it answers | Why it is there and not elsewhere |
 * | --- | --- | --- |
 * | Advisory / Read-only | "Can this thing change anything?" | **No.** Stated before the answer, not in a footnote |
 * | Answer | "What is the position?" | Concise. Never a wall of prose |
 * | Why | "On what basis?" | One line per supporting claim, in claim order |
 * | Evidence | "Where does this come from?" | Citations, each drilling to its source view (AC-3) |
 * | Limitations | "What must I not conclude?" | Caveats are **computed**, not written. Above the fold, never collapsed |
 * | As-of | "How current is this?" | On every answer |
 *
 * Three things this surface deliberately does not have, each because it would be a lie:
 *
 *   - **No confidence meter.** Nothing here is calibrated (DR-061). A dial reading "87% confident"
 *     would manufacture precision the model does not have.
 *   - **No avatar, no typing indicator, no persona.** The composer kind is stated as a fact
 *     (`Deterministic composer` or the model id), because calling a template "AI" is the same class
 *     of claim-strength failure as an unqualified "0% late detection".
 *   - **No free-text follow-ups.** Suggestions are governed intents, so a suggestion can never
 *     disclose the existence of something the caller may not see.
 */
import type { JSX } from 'react';
import type { AssistantResponse } from '@app';
import type { EvidenceViewModel, InsightViewModel, TableViewModel } from '../index.js';
import {
  DataTable, EvidenceDisclosure, InsightCallout, Panel, RichText, formatInstant, treatmentFor,
} from '../index.js';
import { DemoSyntheticDataBadge } from '../components/demo-badge.js';

export interface DeliveryAssistantProps {
  readonly response: AssistantResponse;
  /** Rendered above the answer. The caller's scope, so a total is never mistaken for the universe. */
  readonly scopeNote?: string;
}

/** Authority maps to a tone. `QUALIFIED` is normal and is not styled as a problem. */
function toneFor(response: AssistantResponse): InsightViewModel['tone'] {
  if (response.refusal !== undefined) return 'caution';
  return response.executiveAuthority === 'AUTHORITATIVE' ? 'analytic' : 'caution';
}

function authorityLabel(response: AssistantResponse): string {
  switch (response.executiveAuthority) {
    case 'AUTHORITATIVE': return 'Executive-authoritative';
    case 'QUALIFIED': return 'Qualified - read the limitations';
    case 'NOT_AUTHORITATIVE': return 'Not executive-authoritative';
  }
}

export function whyTable(response: AssistantResponse): TableViewModel {
  return {
    caption: 'The claims this answer rests on',
    density: 'compact',
    summary: `${String(response.materialClaims.length)} material claims`,
    columns: [
      { key: 'claim', header: 'Claim' },
      { key: 'layer', header: 'Layer', description: 'Epistemic layer: observed fact, derived metric, or assessment' },
      { key: 'metric', header: 'Metric / rule' },
      { key: 'state', header: 'Evidence state' },
    ],
    rows: response.materialClaims.map((c) => ({
      id: c.claimId,
      cells: {
        claim: { display: c.text },
        // An assessment is never styled like a fact (AI_TRUST_CONTRACT.md CS-10). The layer to
        // treatment mapping already exists in the design system; reuse it rather than restate it.
        layer: { display: c.epistemicLayer, treatment: treatmentFor(c.epistemicLayer) },
        metric: { display: c.envelope.metricId ?? c.envelope.ruleId ?? '—' },
        state: { display: c.envelope.signalState },
      },
    })),
  };
}

export function evidenceModel(response: AssistantResponse): EvidenceViewModel {
  return {
    title: 'Evidence behind this answer',
    computedAt: response.asOf,
    lines: response.evidence.map((c) => ({ label: c.label, value: c.ref.entityId })),
    sources: response.metricRefs.map((m) => `${m.metricId} v${m.version}`),
  };
}

/**
 * Limitations are rendered **open**, above the evidence, and never behind a disclosure.
 *
 * A caveat a reader has to click to see is a caveat that will not be read in the thirty seconds an
 * executive spends here, and every one of these was computed precisely because the answer would
 * otherwise be quoted at a strength its payload does not support.
 */
function Limitations({ response }: { readonly response: AssistantResponse }): JSX.Element | null {
  if (response.caveats.length === 0) return null;
  return (
    <Panel title="Limitations">
      <ul className="gl-stack" style={{ margin: 0, paddingInlineStart: 'var(--gl-space-md)' }}>
        {response.caveats.map((c) => (
          <li key={`${c.ruleId}:${c.claimId}`} className="gl-body-sm">
            <strong>{c.ruleId}</strong>
            {' — '}
            {c.text}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MissingEvidence({ response }: { readonly response: AssistantResponse }): JSX.Element | null {
  if (response.missingEvidence.length === 0) return null;
  return (
    <Panel title="What could not be computed">
      <ul className="gl-stack" style={{ margin: 0, paddingInlineStart: 'var(--gl-space-md)' }}>
        {response.missingEvidence.map((m) => (
          <li key={m.input} className="gl-body-sm">
            <strong>{m.input}</strong>
            {` (${m.state}) — `}
            {m.reason}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DeliveryAssistant({ response, scopeNote }: DeliveryAssistantProps): JSX.Element {
  const insight: InsightViewModel = {
    id: 'assistant-answer',
    tone: toneFor(response),
    headline: response.refusal === undefined ? 'Answer' : 'Cannot answer',
    body: response.answer,
    treatment: 'inferred',
  };

  return (
    <div className="gl-stack">
      {/* Advisory / read-only, stated before the answer. Not a footnote. */}
      <div className="gl-callout">
        <span aria-hidden="true">◈</span>
        <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
          <span className="gl-card-title">Advisory · Read only</span>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>
            This assistant reads governed assessments and explains them. It cannot change a
            baseline, an ETC, a Reported or System RAG, a recovery plan, a rule or a threshold, and
            it holds no capability that could. Every figure comes from a domain engine and cites it.
          </p>
          <DemoSyntheticDataBadge />
        </div>
      </div>

      <Panel title="Question">
        <p className="gl-body" style={{ margin: 0, maxWidth: '96ch' }}>{response.question}</p>
        <p className="gl-body-sm" style={{ margin: 0 }}>
          {scopeNote ?? `${response.scope.scopeLabel} · ${String(response.scope.authorisedProjectCount)} projects authorised`}
          {` · as at ${formatInstant(response.asOf)}`}
          {` · ${authorityLabel(response)}`}
          {` · ${response.composer === 'DETERMINISTIC_COMPOSER' ? 'Deterministic composer — no language model is used' : response.composer}`}
        </p>
      </Panel>

      <InsightCallout insight={insight} />

      {response.why.length > 0 ? (
        <Panel title="Why">
          <ul className="gl-stack" style={{ margin: 0, paddingInlineStart: 'var(--gl-space-md)' }}>
            {response.why.map((line) => (
              <li key={line} className="gl-body-sm">{line}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Limitations response={response} />
      <MissingEvidence response={response} />

      {response.materialClaims.length > 0 ? (
        <Panel title="Claims and provenance">
          <DataTable table={whyTable(response)} />
          <EvidenceDisclosure evidence={evidenceModel(response)} label="View evidence" />
        </Panel>
      ) : null}

      {response.suggestedFollowUps.length > 0 ? (
        <Panel title="Questions this product can answer">
          <ul className="gl-stack" style={{ margin: 0, paddingInlineStart: 'var(--gl-space-md)' }}>
            {response.suggestedFollowUps.map((s) => (
              <li key={`${s.intent}:${s.label}`} className="gl-body-sm">{s.label}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
