/**
 * Builds the Assistant workspace and Knowledge & Connections surfaces, and captures the recorded
 * run the static preview shows when no trusted runtime is reachable.
 *
 * **The recording is a transcript, not a fixture.** Every turn below is produced by calling
 * `askWithPlan` against the real gateway, the real engines and the real registry at build time. The
 * figures in it were computed by the governed services; nothing is written by hand. That is the only
 * form of "recorded demonstration" this repository is willing to ship, because a hand-written
 * transcript of a product's own capability is indistinguishable from a claim about it.
 */
import {
  GatewayToolPort, NEW_CONVERSATION, askWithPlan, vocabularyFrom,
} from '@app';
import type { ConversationState, PlannedAnswer, PlannerVocabulary, SourceRegistry } from '@app';
import { DEMO_NOW, createDemoApi } from '../security/demo-api.js';
import { knowledgeDemo, syncFixtures } from '../fixtures/demo-knowledge.js';
import { esc } from './gl-shell.js';

export interface RecordedTurn {
  readonly question: string;
  readonly answer: string;
  readonly why: readonly string[];
  readonly scopeLine: string;
  readonly recognised: readonly string[];
  readonly answerability: PlannedAnswer['answerability'];
  readonly evidence: PlannedAnswer['evidence'];
  readonly executiveAuthority: string;
  readonly composer: string;
  readonly plan: PlannedAnswer['plan'];
  readonly claims: readonly {
    readonly layer: string; readonly text: string; readonly display: string | null;
    readonly metricId: string | null;
  }[];
  readonly suggestedFollowUps: readonly { readonly label: string }[];
}

export interface KnowledgeBuild {
  readonly recorded: { readonly capturedAt: string; readonly turns: readonly RecordedTurn[] };
  readonly registry: SourceRegistry;
  readonly receipts: readonly ReturnType<SourceRegistry['verify']>[];
}

/**
 * The conversation the recording captures.
 *
 * A four-turn refinement followed by three independent questions and two declines. Chosen to show
 * what the product does rather than what it is best at: the two declines are in the recording on
 * purpose, because a demonstration that only contains successes is a demonstration of nothing.
 */
const SCRIPT: readonly string[] = [
  'Which Green projects should I worry about over the next 60 days?',
  'Only Automotive.',
  'Which one has the greatest economic exposure?',
  'What is the portfolio forecast margin across the whole portfolio?',
  'What changed since the previous review?',
  'Where is margin erosion concentrated?',
  'What is the probability that our worst project fails?',
];

export async function buildKnowledge(): Promise<KnowledgeBuild> {
  const api = createDemoApi();
  const login = await api.login('exec.cdo');
  if (login === undefined) throw new Error('demo login failed');
  const ctx = api.contextFor('usr-exec-cdo', login.sessionId);
  const authorised = (await api.policy.resolveScope(ctx.auth)).projectIds;

  const discovered = await vocabularyFrom({
    ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
  });
  const vocabulary: PlannerVocabulary = { ...discovered, accounts: [], customers: [] };

  const first = discovered.projects[0];
  const demo = knowledgeDemo(authorised, first?.id ?? authorised[0] ?? 'prj-001');
  // The three uploads the Knowledge surface renders: a contract, a supplemental extract, and a file
  // of deliberately bad rows whose quarantine is the point.
  await syncFixtures(demo.registry, authorised);
  demo.addAtlasSow();
  demo.addSupplementalFinancials();
  demo.addBadRows();
  demo.addUnassociatedMinutes();

  const tools = new GatewayToolPort(ctx, api.gateway, DEMO_NOW, authorised, demo.registry);

  const turns: RecordedTurn[] = [];
  let state: ConversationState = NEW_CONVERSATION;
  for (const question of SCRIPT) {
    // No narration port: the recording is the deterministic floor, so it is reproducible and does
    // not depend on a credential being present at build time.
    const answer = await askWithPlan(question, {
      ctx, tools, asOf: DEMO_NOW, scopeLabel: 'Chief Delivery Officer',
      populationCount: authorised.length, vocabulary, knownMetricIds: [], state,
      knowledge: demo.registry,
    });
    state = answer.state;
    turns.push({
      question,
      answer: answer.response.answer,
      why: answer.response.why,
      scopeLine: answer.scopeLine,
      recognised: answer.recognised,
      answerability: answer.answerability,
      evidence: answer.evidence,
      executiveAuthority: answer.response.executiveAuthority,
      composer: answer.response.composer,
      plan: answer.plan,
      claims: answer.response.materialClaims.map((c) => ({
        layer: c.epistemicLayer, text: c.text, display: c.display, metricId: c.envelope.metricId,
      })),
      suggestedFollowUps: answer.response.suggestedFollowUps.map((s) => ({ label: s.label })),
    });
  }

  const sourceIds = demo.registry.sourceList().map((s) => s.sourceId);
  return {
    recorded: { capturedAt: DEMO_NOW, turns },
    registry: demo.registry,
    receipts: sourceIds.map((id) => demo.registry.verify(id)),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const STATUS_WORD: Readonly<Record<string, string>> = {
  REAL_VERIFIED: 'Connected · verified',
  CONFIGURED_UNVERIFIED: 'Configured · unverified',
  ADAPTER_READY: 'Adapter ready',
  FIXTURE: 'Synthetic fixture',
  NOT_CONFIGURED: 'Not configured',
  DEGRADED: 'Degraded',
  SYNCING: 'Synchronising',
  ERROR: 'Error',
  MAPPING_REVIEW_REQUIRED: 'Mapping review required',
};

/** The Knowledge & Connections table. Status, authority and data context on every row. */
export function sourcesTable(registry: SourceRegistry): string {
  const rows = registry.sources().map((s) => `
        <tr>
          <td><b>${esc(s.displayName)}</b><div class="gl-note" style="font-size:12.5px;margin-top:3px">${esc(registry.statusMeaning(s.status as never, s.kind as never))}</div></td>
          <td>${esc(s.kind.toLowerCase().replace(/_/g, ' '))}</td>
          <td><span class="gl-status gl-status--${esc(s.status)}">${esc(STATUS_WORD[s.status] ?? s.status)}</span></td>
          <td>${esc(s.dataContext)}</td>
          <td>${esc(s.authority)}</td>
          <td class="gl-num">${String(s.recordCount)}</td>
          <td class="gl-num">${String(s.conflicts)}</td>
        </tr>`).join('');
  return `
      <div style="overflow-x:auto"><table class="gl-t gl-srcgrid">
        <thead><tr>
          <th>Source</th><th>Type</th><th>Status</th><th>Data context</th>
          <th>Authority</th><th>Records</th><th>Conflicts</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

/** Verify Knowledge — the three legs of "grounded", reported separately. */
export function verificationTable(build: KnowledgeBuild): string {
  const verdictWord: Readonly<Record<string, string>> = {
    GROUNDED: 'Grounded — ingested, retrievable, and used in an answer',
    INGESTED_NOT_USED: 'Ingested and retrievable — no answer has used it yet',
    INGESTED_NOT_REACHABLE: 'Ingested — no question will reach it, because it is associated with no project',
    NOT_INGESTED: 'Nothing has been ingested from this source',
  };
  const rows = build.receipts
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .filter((v) => v.ingested)
    .map((v) => `
        <tr>
          <td><b>${esc(v.displayName)}</b>${v.fingerprint === null ? '' : `<div class="gl-note" style="font-size:12px;margin-top:3px">${esc(v.fingerprint.slice(0, 24))}…</div>`}</td>
          <td>${esc(verdictWord[v.verdict] ?? v.verdict)}</td>
          <td class="gl-num">${String(v.recordsReceived)}</td>
          <td class="gl-num">${String(v.recordsAccepted)}</td>
          <td class="gl-num">${String(v.recordsQuarantined)}</td>
          <td class="gl-num">${String(v.chunksIndexed)}</td>
          <td>${v.lastUsedFor === null ? '<span class="gl-note">not yet used</span>' : esc(v.lastUsedFor.slice(0, 80))}</td>
        </tr>`).join('');
  return `
      <div style="overflow-x:auto"><table class="gl-t gl-srcgrid">
        <thead><tr>
          <th>Source</th><th>Verification</th><th>Received</th><th>Accepted</th>
          <th>Quarantined</th><th>Indexed</th><th>Last used for</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

/**
 * The conflict register.
 *
 * Two sources, one project, one concept, one period, materially different values — with the
 * governed answer and the disagreement side by side. The losing value is shown deliberately: the
 * disclosure needs both numbers, and a register that showed only the winner would be indistinguishable
 * from a system that had silently merged them.
 */
export function conflictTable(registry: SourceRegistry): string {
  const conflicts = registry.conflicts();
  if (conflicts.length === 0) {
    return '<p class="gl-note" style="margin-top:18px">No source disagreement has been recorded.</p>';
  }
  const rows = conflicts.slice(0, 20).map((c) => {
    const others = c.entries.filter((e) => e.sourceId !== c.governedSourceId);
    return `
        <tr>
          <td><b>${esc(c.projectId)}</b></td>
          <td>${esc(c.concept)}<div class="gl-note" style="font-size:12.5px;margin-top:3px">as at ${esc(c.period)}</div></td>
          <td class="gl-num">${esc(c.governedValue)}<div class="gl-note" style="font-size:12.5px;margin-top:3px">${esc(c.governedSourceId)} · ${esc(c.governedAuthority.toLowerCase().replace(/_/g, ' '))}</div></td>
          <td class="gl-num">${others.map((e) => `${esc(e.value)}<div class="gl-note" style="font-size:12.5px;margin-top:3px">${esc(e.sourceId)} · ${esc(e.authority.toLowerCase().replace(/_/g, ' '))}</div>`).join('')}</td>
          <td>${c.unresolvedAuthority
    ? 'No source outranks the other. This is a governance defect, not a data one — the registry should have made the tie impossible.'
    : 'The higher authority governs. The disagreement is disclosed and neither value was changed.'}</td>
        </tr>`;
  }).join('');
  return `
      <div style="overflow-x:auto"><table class="gl-t gl-srcgrid">
        <thead><tr>
          <th>Project</th><th>Concept</th><th>Governed value</th><th>Also reported</th><th>Resolution</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

/** The quarantine register: what was rejected, and the reason a person can act on. */
export function quarantineTable(registry: SourceRegistry): string {
  const records = registry.quarantined();
  if (records.length === 0) {
    return '<p class="gl-note" style="margin-top:18px">No record has been quarantined.</p>';
  }
  const rows = records.slice(0, 20).map((r) => `
        <tr>
          <td class="gl-num">${String(r.rowNumber)}</td>
          <td>${esc(r.naturalKey === '' ? '(blank)' : r.naturalKey)}</td>
          <td>${r.findings.map((f) => `<div>${esc(f.code.toLowerCase().replace(/_/g, ' '))} — ${esc(f.detail)}</div>`).join('')}</td>
        </tr>`).join('');
  return `
      <div style="overflow-x:auto"><table class="gl-t gl-srcgrid">
        <thead><tr><th>Row</th><th>Source identifier</th><th>Why it was rejected</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

/** The authority registry, rendered per concept. An implicit precedence is an unauditable one. */
export function authorityTable(registry: SourceRegistry): string {
  const grants = [...registry.authority.all()].sort(
    (a, b) => a.concept.localeCompare(b.concept) || a.priority - b.priority,
  );
  const rows = grants.map((g) => `
        <tr>
          <td>${esc(g.concept)}</td>
          <td>${esc(g.sourceId)}</td>
          <td>${esc(g.authority.toLowerCase().replace(/_/g, ' '))}</td>
          <td class="gl-note" style="font-size:13px">${esc(g.rationale)}</td>
        </tr>`).join('');
  return `
      <div style="overflow-x:auto"><table class="gl-t gl-srcgrid">
        <thead><tr><th>Canonical concept</th><th>Source</th><th>Authority</th><th>Why</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}
