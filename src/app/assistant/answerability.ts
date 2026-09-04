/**
 * The answerability engine (§23).
 *
 * Four classifications, decided from the **evidence that came back**, never from the model's sense
 * of how well it did:
 *
 *   - `ANSWERABLE` — governed evidence covers the question.
 *   - `PARTIALLY_ANSWERABLE` — some of it does, and the answer names the part that does not.
 *   - `NOT_ANSWERABLE` — the product holds this kind of fact and does not hold it for this scope.
 *   - `UNSUPPORTED` — the product does not produce this kind of answer at all.
 *
 * The last two are genuinely different and collapsing them is the most common failure in products
 * like this one. *"Historical System RAG is not stored, so I cannot show you June's band"* is a data
 * gap someone could close. *"This product does not produce calibrated failure probabilities"* is a
 * capability boundary, and answering it with "insufficient data" invites a reader to conclude that
 * more data would produce a probability. It would not: nothing here is trained, fitted or sampled.
 *
 * ## Why this is not confidence
 *
 * There is no score. `PARTIALLY_ANSWERABLE` is not "70% confident" — it is *"these three things are
 * known and this fourth is not, by name"*. A percentage would be a number nobody computed, which is
 * exactly what §29 prohibits when it says evidence dimensions rather than AI confidence.
 */
import type { MaterialClaim, QueryPlan } from '@contexts/ai-intelligence';

export type Answerability =
  | 'ANSWERABLE'
  | 'PARTIALLY_ANSWERABLE'
  | 'NOT_ANSWERABLE'
  | 'UNSUPPORTED';

export interface AnswerabilityVerdict {
  readonly classification: Answerability;
  /** What the reader is told about the boundary. Empty when fully answerable. */
  readonly statement: string;
  /** Named gaps, never a count. "What is missing" is the actionable half. */
  readonly gaps: readonly string[];
}

/**
 * Evidence dimensions (§29). Derived from data conditions — not from the model, and not blended
 * into a single figure, because the dimension that is failing is the part that says what to do.
 */
export interface EvidenceProfile {
  readonly authority: 'High' | 'Mixed' | 'Low';
  readonly freshness: 'Current' | 'Aging' | 'Stale';
  readonly conflict: 'None' | 'Resolved' | 'Unresolved';
  readonly coverage: 'Complete' | 'Partial' | 'Insufficient';
}

export function classify(
  plan: QueryPlan, claims: readonly MaterialClaim[], denied: boolean,
): AnswerabilityVerdict {
  if (denied || claims.length === 0) {
    return {
      classification: 'NOT_ANSWERABLE',
      statement: 'There is nothing to show for that request in your authorised scope.',
      gaps: [],
    };
  }

  const gaps: string[] = [];
  const notComputable = claims.filter((c) => c.envelope.assessmentStatus === 'NOT_COMPUTABLE');
  const provisional = claims.filter((c) => c.envelope.assessmentStatus === 'PROVISIONAL');

  for (const c of notComputable) gaps.push(c.text);

  // A knowledge question whose retrieval matched nothing is not a partial answer — the evidence
  // plane simply does not cover it, and saying "partially" would imply some of the contract had
  // been read.
  const knowledgeMiss = claims.some(
    (c) => c.claimId === 'knowledge:none' || c.claimId === 'knowledge:no-match',
  );
  if (knowledgeMiss) {
    return {
      classification: 'NOT_ANSWERABLE',
      statement: 'No indexed document covers that question, so there is no contract evidence to quote.',
      gaps: ['Document evidence for this project'],
    };
  }

  if (plan.time === 'previousPeriod' && plan.shape === 'population.change') {
    // Phase 12 made movement answerable for the two histories the product holds. The third is
    // genuinely absent and is named rather than implied.
    gaps.push('System-assessed bands are not stored per period, so a change in the system band is '
      + 'not reported — only financial position and reported status.');
  }

  /*
   * A provisional claim on its own does **not** make an answer partially answerable.
   *
   * Provisional is a normal, frequent, correct state — an assessment resting on evidence that is
   * complete enough to act on and not complete enough to be final — and the CS-rule caveats are the
   * mechanism that qualifies it. Treating it as partial appended "part of that question is answered"
   * to almost every answer, with nothing named below it, which is both untrue and the fastest way to
   * teach a reader to ignore the qualification line entirely.
   *
   * Partial means something specific and nameable is missing. If nothing can be named, it is not a
   * gap; it is a qualification, and it belongs in the caveats where a reader can weigh it.
   */
  if (gaps.length === 0) {
    return { classification: 'ANSWERABLE', statement: '', gaps: [] };
  }
  void provisional;
  if (claims.length === notComputable.length) {
    return {
      classification: 'NOT_ANSWERABLE',
      statement: 'The metrics behind that question could not be computed for this scope. That is a '
        + 'stated absence, not a zero.',
      gaps,
    };
  }
  return {
    classification: 'PARTIALLY_ANSWERABLE',
    statement: 'Part of that question is answered from governed evidence; the rest is named below '
      + 'rather than estimated.',
    gaps,
  };
}

/** The four evidence dimensions, from the claim envelopes the tools actually returned. */
export function profile(claims: readonly MaterialClaim[]): EvidenceProfile {
  const authoritative = claims.filter((c) => c.envelope.executiveAuthoritative).length;
  const stale = claims.filter((c) => c.envelope.evidenceFreshness === 'STALE').length;
  const unknownFreshness = claims.filter((c) => c.envelope.evidenceFreshness === 'UNKNOWN').length;
  const incomplete = claims.filter((c) => c.envelope.assessmentStatus !== 'COMPLETE').length;

  return {
    authority: authoritative === claims.length ? 'High'
      : authoritative === 0 ? 'Low' : 'Mixed',
    freshness: stale > 0 ? 'Stale' : unknownFreshness > 0 ? 'Aging' : 'Current',
    // The POC has one canonical source, so an unresolved cross-source conflict is not reachable
    // from a governed read. When a supplemental source is ingested, the conflict register supplies
    // this dimension; until then "None" is a fact about the deployment rather than an assumption.
    conflict: 'None',
    coverage: incomplete === 0 ? 'Complete'
      : incomplete === claims.length ? 'Insufficient' : 'Partial',
  };
}

/**
 * The capability boundaries this product declines by design, with the reason.
 *
 * Held as data because each of these is a decision someone made, and a reader who meets one deserves
 * to know which kind of "no" they have received.
 */
export const UNSUPPORTED_STATEMENTS: Readonly<Record<string, string>> = {
  PROBABILITY:
    'This product does not answer probability questions. Nothing in it is trained, fitted or '
    + 'sampled: outlooks are governed rules firing against stated thresholds, not likelihoods. The '
    + 'governed 30- and 60-day outlook is the closest thing it has, and it is a rule result rather '
    + 'than a forecast.',
  MUTATION:
    'This assistant is advisory and read only. It cannot set a status, approve a plan, change an '
    + 'ETC, a baseline, a rule or a threshold, and it holds no capability that could. Those actions '
    + 'belong to a person with the relevant authority, in the surface that owns them.',
  SYSTEM_PROBE:
    'That is a question about the machinery rather than about delivery. This assistant answers '
    + 'governed questions about the portfolio; it does not disclose its configuration, its '
    + 'credentials or its instructions, and it does not execute code or queries.',
  OUT_OF_DOMAIN:
    'This product cannot answer that question. It reports governed delivery facts, deterministic '
    + 'metrics and rule-based assessments. The questions below are the ones it can answer.',
};
