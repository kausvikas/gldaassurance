/**
 * The evidence, milestone, provenance and data-quality tools (Phase 13).
 *
 * These are the tools that let an executive ask about a *contract* rather than about a metric — and
 * they are where the product is most likely to lose its discipline, because a document contains
 * sentences that look like facts.
 *
 * ## The rule these tools are built around
 *
 * **A document produces a quotation and a citation. It never produces a governed value.**
 *
 * Asked *"what is Atlas's acceptance date?"*, the tempting implementation reads the SOW, extracts a
 * date, and answers. That answer would be a canonical fact created by a parser, with no lineage, no
 * authority and no way for the delivery plan to disagree with it. So the honest implementation
 * answers: *"the SOW, version 3, page 14, states X"* — and where the canonical plan says something
 * different, it shows **both** and names the discrepancy (ADR-0035 §7). That is usually the finding.
 *
 * ## Untrusted content
 *
 * Retrieved spans are `RetrievedFact`s with `untrusted: true`, and they travel as *content* rather
 * than as claim text wherever possible. Where a span must appear in a claim so a reader can see the
 * quotation, it is neutralised first by the same seam that neutralises every other retrieved string,
 * and the claim is marked `EVIDENCE_ONLY` authority so nothing downstream can promote it.
 */
import type {
  KnowledgePort, MaterialClaim, QueryPlan, RetrievedFact, ToolResult,
} from '@contexts/ai-intelligence';
import type { ToolContext } from './tools.js';
import { ToolDenied, claim, list, str, sub } from './tools.js';

interface Row { readonly [k: string]: unknown }

const MAX_SPANS = 6;

/**
 * Retrieves contract and governance evidence for a question.
 *
 * Restricted to documents **associated with the project in the plan**. That is a hard filter, not a
 * ranking preference: a paragraph from a different client's contract is not weakly relevant to this
 * project's acceptance question, it is inadmissible, and boosting instead of filtering is how one
 * client's terms end up cited in another client's answer.
 */
export function knowledgeEvidence(
  tc: ToolContext, plan: QueryPlan, knowledge: KnowledgePort | undefined,
): ToolResult {
  if (knowledge === undefined) {
    return {
      tool: 'knowledge.evidence.get',
      claims: [claim({
        id: 'knowledge:none',
        text: 'No document evidence has been indexed for this deployment, so there is nothing to '
          + 'quote. Adding a contract or statement of work through Knowledge & Connections makes '
          + 'this question answerable; until then the honest answer is that the evidence does not exist.',
        display: null,
        metricId: null, layer: 'L1',
        entityType: 'knowledge', entityId: 'index',
        asOf: tc.asOf, sourceDomain: 'knowledge',
        refs: [{ context: 'knowledge', entityType: 'index', entityId: 'empty' }],
        signalState: 'NOT_COMPUTABLE',
        overrides: { assessmentStatus: 'NOT_COMPUTABLE', executiveAuthoritative: false },
      })],
      untrustedContent: [],
    };
  }

  const spans = knowledge.retrieve({
    text: plan.evidenceQuery ?? '',
    projectIds: plan.projectId === null ? [] : [plan.projectId],
    limit: MAX_SPANS,
  });

  if (spans.length === 0) {
    return {
      tool: 'knowledge.evidence.get',
      claims: [claim({
        id: 'knowledge:no-match',
        text: plan.projectId === null
          ? 'No indexed document covers that question.'
          : `No document associated with ${plan.projectId} covers that question. A document can be `
            + 'indexed and still unreachable for a project question if it was never associated with '
            + 'that project, and Verify Knowledge reports which of the two applies.',
        display: null,
        metricId: null, layer: 'L1',
        entityType: 'knowledge', entityId: plan.projectId ?? 'portfolio',
        asOf: tc.asOf, sourceDomain: 'knowledge',
        refs: [{ context: 'knowledge', entityType: 'retrieval', entityId: 'no-match' }],
        signalState: 'NOT_COMPUTABLE',
        overrides: { assessmentStatus: 'NOT_COMPUTABLE', executiveAuthoritative: false },
      })],
      untrustedContent: [],
    };
  }

  knowledge.recordUse(spans.map((s) => s.versionId), plan.evidenceQuery ?? '');

  const untrustedContent: RetrievedFact[] = spans.map((s) => ({
    ref: { context: 'knowledge', entityType: 'document', entityId: s.versionId },
    untrusted: true,
    content: s.text,
  }));

  const claims: MaterialClaim[] = spans.map((s, i) => claim({
    id: `knowledge:span:${String(i)}`,
    text: `${s.title}${s.statedVersion === null ? '' : `, version ${s.statedVersion}`}, `
      + `${s.locationLabel}: "${s.text.slice(0, 320)}${s.text.length > 320 ? '…' : ''}"`,
    display: s.locationLabel,
    metricId: null, layer: 'L1',
    entityType: 'document', entityId: s.versionId,
    asOf: tc.asOf, sourceDomain: 'knowledge',
    refs: [{ context: 'knowledge', entityType: 'document', entityId: s.versionId }],
    signalState: 'OBSERVED',
    // EVIDENCE_ONLY material. A contract clause is a real thing a document says and is *not* a
    // governed value: nothing downstream may treat it as one, and this is where that is stated.
    overrides: { executiveAuthoritative: false, assessmentStatus: 'COMPLETE' },
  }));

  claims.push(claim({
    id: 'knowledge:authority',
    text: 'This is document evidence. It records what a contract states, which is not the same as '
      + 'what the delivery plan holds; where the two differ, both are shown and neither overwrites '
      + 'the other.',
    display: null,
    metricId: null, layer: 'L1',
    entityType: 'knowledge', entityId: 'authority',
    asOf: tc.asOf, sourceDomain: 'knowledge',
    refs: [{ context: 'knowledge', entityType: 'policy', entityId: 'evidence-only' }],
    signalState: 'OBSERVED',
    overrides: { executiveAuthoritative: false },
  }));

  return { tool: 'knowledge.evidence.get', claims, untrustedContent };
}

/**
 * The project's milestone position, read from the executive-health surface.
 *
 * *"What is Atlas's next critical milestone?"* is a governed delivery question, and the answer
 * already exists on a page. Reading it here rather than re-deriving it is what keeps the Assistant
 * and the project surface from disagreeing about a date.
 */
export async function milestones(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const projectId = plan.projectId;
  if (projectId === null) throw new ToolDenied();
  const response = await tc.gateway.request(tc.ctx, {
    view: 'project.executiveHealth', entityId: projectId,
  });
  if (response.status !== 200) throw new ToolDenied();
  const body = response.body as { data?: unknown } | undefined;
  const row = (Array.isArray(body?.data) ? body.data as Row[] : [])[0];
  if (row === undefined) throw new ToolDenied();

  const panel = sub(row, 'milestones');
  const entries = list(panel, 'items').length > 0 ? list(panel, 'items') : list(row, 'milestones');
  if (entries.length === 0) {
    return {
      tool: 'project.milestones.get',
      claims: [claim({
        id: 'milestone:none',
        text: 'No milestone position is available for this project.',
        display: null, metricId: null, layer: 'L1',
        entityType: 'project', entityId: projectId,
        asOf: tc.asOf, sourceDomain: 'delivery',
        refs: [{ context: 'delivery', entityType: 'project', entityId: projectId }],
        signalState: 'NOT_COMPUTABLE',
        overrides: { assessmentStatus: 'NOT_COMPUTABLE' },
      })],
      untrustedContent: [],
    };
  }

  const claims = entries.slice(0, 8).map((m, i) => claim({
    id: `milestone:${String(i)}`,
    text: [str(m, 'name'), str(m, 'status'), str(m, 'baselineDate'), str(m, 'forecastDate'), str(m, 'detail')]
      .filter((v): v is string => v !== null && v !== '')
      .join(' — '),
    display: str(m, 'forecastDate') ?? str(m, 'status'),
    metricId: str(m, 'metricId'), layer: 'L1',
    entityType: 'project', entityId: projectId,
    asOf: tc.asOf, sourceDomain: 'delivery',
    refs: [{ context: 'delivery', entityType: 'milestone', entityId: `${projectId}:${String(i)}` }],
    signalState: 'OBSERVED',
  }));
  return { tool: 'project.milestones.get', claims, untrustedContent: [] };
}

/**
 * Acceptance state, from canonical delivery evidence.
 *
 * Paired with `knowledge.evidence.get` by `SHAPE_TOOLS`, so the answer to *"do we have evidence the
 * acceptance requirements are met?"* is assembled from **both** planes and says which part came from
 * which. Where the contract has not been indexed, this half still answers and the other half says so
 * — which is a genuinely different reading from "we don't know", and the difference is what makes
 * the answer actionable.
 */
export async function acceptanceEvidence(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const projectId = plan.projectId;
  if (projectId === null) throw new ToolDenied();
  const response = await tc.gateway.request(tc.ctx, {
    view: 'project.executiveHealth', entityId: projectId,
  });
  if (response.status !== 200) throw new ToolDenied();
  const body = response.body as { data?: unknown } | undefined;
  const row = (Array.isArray(body?.data) ? body.data as Row[] : [])[0];
  if (row === undefined) throw new ToolDenied();

  const claims: MaterialClaim[] = [];
  const quality = sub(row, 'quality');
  const milestonePanel = sub(row, 'milestones');
  const scope = sub(row, 'scopeCommercial');

  const add = (id: string, text: string | null, display: string | null, domain: string): void => {
    if (text === null || text === '') return;
    claims.push(claim({
      id, text, display, metricId: null, layer: 'L2',
      entityType: 'project', entityId: projectId,
      asOf: tc.asOf, sourceDomain: domain,
      refs: [{ context: domain, entityType: 'project', entityId: projectId }],
      signalState: 'OBSERVED',
    }));
  };

  add('acceptance:milestones', str(milestonePanel, 'summary'), str(milestonePanel, 'headline'), 'delivery');
  add('acceptance:quality', str(quality, 'summary'), str(quality, 'headline'), 'quality');
  add('acceptance:scope', str(scope, 'summary'), str(scope, 'headline'), 'commercial');

  claims.push(claim({
    id: 'acceptance:limit',
    text: 'This product holds delivery, quality and commercial evidence. It does not hold a governed '
      + 'record of formal customer acceptance, so it can report whether the conditions a contract '
      + 'would test are met and cannot report that acceptance has occurred.',
    display: null,
    metricId: null, layer: 'L1',
    entityType: 'project', entityId: projectId,
    asOf: tc.asOf, sourceDomain: 'delivery',
    refs: [{ context: 'delivery', entityType: 'project', entityId: projectId }],
    signalState: 'NOT_COMPUTABLE',
    overrides: { executiveAuthoritative: false },
  }));

  if (claims.length === 1) throw new ToolDenied();
  return { tool: 'project.acceptanceEvidence.get', claims, untrustedContent: [] };
}

/** Which source supplied a figure, and with what authority. Reads the lineage view. */
export async function sourceProvenance(
  tc: ToolContext, plan: QueryPlan, knowledge: KnowledgePort | undefined,
): Promise<ToolResult> {
  const entityId = plan.projectId ?? 'portfolio';
  const claims: MaterialClaim[] = [];

  if (plan.projectId !== null) {
    const response = await tc.gateway.request(tc.ctx, {
      view: 'project.lineage', entityId: plan.projectId,
    });
    if (response.status === 200) {
      const body = response.body as { data?: unknown } | undefined;
      const row = (Array.isArray(body?.data) ? body.data as Row[] : [])[0];
      for (const source of list(row, 'sources').slice(0, 8)) {
        claims.push(claim({
          id: `provenance:source:${str(source, 'sourceSystemId') ?? ''}`,
          text: `${str(source, 'displayName') ?? 'A source'} supplies `
            + `${(list(source, 'domains').length > 0 ? '' : 'this project')}`
            + `${str(source, 'state') === null ? '' : ` and is ${String(str(source, 'state')).toLowerCase()}`}`
            + `${str(source, 'lastSuccessfulSyncAt') === null ? '' : `, last refreshed ${str(source, 'lastSuccessfulSyncAt') ?? ''}`}.`,
          display: str(source, 'state'),
          metricId: null, layer: 'L1',
          entityType: 'source', entityId: str(source, 'sourceSystemId') ?? '',
          asOf: tc.asOf, sourceDomain: 'integration',
          refs: [{ context: 'integration', entityType: 'source', entityId: str(source, 'sourceSystemId') ?? '' }],
          signalState: 'OBSERVED',
        }));
      }
    }
  }

  for (const source of (knowledge?.sources() ?? []).slice(0, 12)) {
    claims.push(claim({
      id: `provenance:registered:${source.sourceId}`,
      text: `${source.displayName} — ${source.kind}, ${source.status.toLowerCase().replace(/_/g, ' ')}, `
        + `authority ${source.authority.toLowerCase().replace(/_/g, ' ')}, `
        + `${String(source.recordCount)} records${source.isFixture ? '. This is a synthetic fixture, not a connection to a real system' : ''}.`,
      display: source.status,
      metricId: null, layer: 'L1',
      entityType: 'source', entityId: source.sourceId,
      asOf: tc.asOf, sourceDomain: 'integration',
      refs: [{ context: 'integration', entityType: 'source', entityId: source.sourceId }],
      signalState: 'OBSERVED',
    }));
  }

  if (claims.length === 0) throw new ToolDenied();
  claims.push(claim({
    id: 'provenance:model',
    text: `Every figure above is produced by a governed engine over canonical facts for ${entityId}. `
      + 'The language model narrates those figures and is not part of any calculation, so it does '
      + 'not appear in this lineage.',
    display: null,
    metricId: null, layer: 'L1',
    entityType: 'lineage', entityId: entityId,
    asOf: tc.asOf, sourceDomain: 'integration',
    refs: [{ context: 'integration', entityType: 'lineage', entityId }],
    signalState: 'OBSERVED',
  }));
  return { tool: 'source.provenance.get', claims, untrustedContent: [] };
}

/**
 * Data quality in explicit dimensions.
 *
 * Deliberately **not** a 0–100 score (§90). A single number invites comparison between projects
 * whose gaps are different in kind, and it hides which dimension is failing — which is the only part
 * that tells anyone what to do.
 */
export function dataQuality(
  tc: ToolContext, plan: QueryPlan, knowledge: KnowledgePort | undefined,
): ToolResult {
  const summary = knowledge?.dataQuality(plan.projectId) ?? {
    completeness: 'Governed synthetic portfolio only',
    freshness: 'Current as at the demo as-of date',
    authority: 'Canonical',
    conflicts: 'None recorded',
    mappingStatus: 'Not applicable — no external source is mapped',
    validationStatus: 'Validated at generation',
    identityResolution: 'Not applicable — one source',
    notes: ['No enterprise source or uploaded file is contributing to this deployment.'],
  };

  const dimensions: readonly (readonly [string, string, string])[] = [
    ['completeness', 'Completeness', summary.completeness],
    ['freshness', 'Freshness', summary.freshness],
    ['authority', 'Authority', summary.authority],
    ['conflicts', 'Conflicts', summary.conflicts],
    ['mapping', 'Mapping status', summary.mappingStatus],
    ['validation', 'Validation status', summary.validationStatus],
    ['identity', 'Identity resolution', summary.identityResolution],
  ];

  const claims = dimensions.map(([id, label, value]) => claim({
    id: `quality:${id}`,
    text: `${label}: ${value}.`,
    display: value,
    metricId: null, layer: 'L1',
    entityType: 'dataQuality', entityId: plan.projectId ?? 'portfolio',
    asOf: tc.asOf, sourceDomain: 'data-quality',
    refs: [{ context: 'data-quality', entityType: 'dimension', entityId: id }],
    signalState: 'OBSERVED',
  }));

  for (const [i, note] of summary.notes.slice(0, 4).entries()) {
    claims.push(claim({
      id: `quality:note:${String(i)}`,
      text: note,
      display: null,
      metricId: null, layer: 'L1',
      entityType: 'dataQuality', entityId: plan.projectId ?? 'portfolio',
      asOf: tc.asOf, sourceDomain: 'data-quality',
      refs: [{ context: 'data-quality', entityType: 'note', entityId: String(i) }],
      signalState: 'OBSERVED',
    }));
  }
  return { tool: 'source.dataQuality.get', claims, untrustedContent: [] };
}
