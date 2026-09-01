/**
 * The deterministic composer (**ADR-0030**, option D's floor).
 *
 * This renders a complete, correct answer with **zero model involvement**, and it is what ships when
 * no language model is configured. It is also the fallback when the validator rejects an LLM
 * narration - which is the property that makes the whole design safe: the product degrades to
 * *correct-and-dull*, never to *fluent-and-wrong*.
 *
 * ## Epistemic wording is enforced here, not requested
 *
 * The sentences below are the governed phrasings from `AI_TRUST_CONTRACT.md` §5 and the phase
 * brief's §4. They are templates rather than guidance because a guideline is something a generator
 * can drift away from one token at a time:
 *
 * | Never | Always |
 * | --- | --- |
 * | "Atlas will turn Red" | "Atlas has a governed 60-day RED outlook based on the listed rule signals" |
 * | "This caused $2M of erosion" | "This governed driver is attributed $2M of the margin movement" |
 * | "$750K will be recovered" | "Compatible recovery actions carry $750K of governed potential GM" |
 *
 * Every figure in the prose comes from a claim's `display` or from the claim's own `text`. **The
 * composer never formats a number and never performs arithmetic** - not even a sum, because a sum
 * is a calculation and the assistant is not the calculator (global invariant 9).
 */
import type {
  AssessmentStatus, Caveat, ClaimEnvelope, ExecutiveAuthority, IntentId, MaterialClaim,
} from '@contexts/ai-intelligence';
import { isFullyAuthoritative } from './envelope.js';
import { neutraliseRetrievedText } from './validator.js';

/**
 * Which claim families each intent speaks about.
 *
 * A tool returns everything its view authorises; the **intent** selects the subset. That keeps
 * ADR-0029's "one tool maps to exactly one ViewId" intact - a second tool over the same view would
 * be a second name for one door - while letting a burn question answer about burn rather than
 * reciting the whole health assessment.
 *
 * Filtering happens *after* retrieval, so it narrows what is said and never what was authorised.
 */
export const INTENT_CLAIMS: Readonly<Record<IntentId, readonly string[]>> = {
  'portfolio.reportedGreenRisk': ['gar:reported'],
  'portfolio.systemEmergingRisk': ['gar:system'],
  'portfolio.ranking': ['rank:'],
  'portfolio.comparison': ['segment:'],
  // Health explanation carries the drivers too. Narrowing it to `rag:`+`dim:` dropped the burn gap
  // and the scope-leakage signals - material drivers that DR-072 requires an executive answer to
  // surface. A grounded answer that omits the decisive fact is still wrong.
  'project.healthExplanation': ['rag:', 'dim:', 'input:', 'burn:', 'scope:'],
  'project.marginDrivers': ['margin:'],
  'project.burnProgress': ['burn:'],
  'project.scopeLeakage': ['scope:'],
  'project.confidence': ['late-detection:'],
  'project.forwardRisk': ['outlook:', 'signal:'],
  'project.recovery': ['recovery:'],
  'evidence.lookup': ['evidence:'],
  'metric.definition': ['metric:'],
};

/**
 * The **minimum claim set** each governed executive intent must carry (DR-072 certification, §17).
 *
 * The model - or the template - may phrase these. **It may not choose to omit them.** An answer
 * that is fully grounded, correctly qualified, and silent about the fired hard override that
 * produced the band is materially misleading, and no grounding control catches it: every sentence
 * in it is true.
 *
 * Each entry is a claim-id prefix that must be present when the tool returned one. Enforced by
 * `missingRequiredClaims()` and asserted per intent by the certification suite.
 */
export const REQUIRED_CLAIMS: Readonly<Record<IntentId, readonly string[]>> = {
  'project.healthExplanation': ['rag:final', 'rag:composite', 'rag:mechanism', 'rag:controls'],
  'project.marginDrivers': ['margin:movement', 'margin:coverage'],
  'project.forwardRisk': ['outlook:'],
  'project.recovery': ['recovery:'],
  'project.confidence': ['late-detection:rate', 'late-detection:coverage'],
  'portfolio.ranking': ['rank:'],
  'portfolio.reportedGreenRisk': ['gar:reported'],
  'portfolio.systemEmergingRisk': ['gar:system'],
  'portfolio.comparison': ['segment:'],
  'project.burnProgress': ['burn:'],
  'project.scopeLeakage': ['scope:'],
  'evidence.lookup': ['evidence:'],
  'metric.definition': ['metric:'],
};

/**
 * Required claim prefixes the answer does not carry.
 *
 * A non-empty result means the answer would omit something governed, and the orchestrator withholds
 * it rather than shipping a materially incomplete executive answer. Silence about a required claim
 * is indistinguishable, to a reader, from that claim being benign.
 */
export function missingRequiredClaims(
  intent: IntentId, claims: readonly MaterialClaim[],
): readonly string[] {
  return (REQUIRED_CLAIMS[intent] ?? []).filter(
    (prefix) => !claims.some((c) => c.claimId.startsWith(prefix)),
  );
}

/** Narrows a tool's claims to the family the intent is about. Never widens. */
export function claimsFor(intent: IntentId, claims: readonly MaterialClaim[]): readonly MaterialClaim[] {
  const prefixes = INTENT_CLAIMS[intent];
  const selected = claims.filter((c) => prefixes.some((p) => c.claimId.startsWith(p)));
  return selected.length > 0 ? selected : claims;
}

/** Claims whose id starts with one of these prefixes, in the order a reader needs them. */
function pick(claims: readonly MaterialClaim[], prefix: string): readonly MaterialClaim[] {
  return claims.filter((c) => c.claimId.startsWith(prefix));
}

function first(claims: readonly MaterialClaim[], id: string): MaterialClaim | undefined {
  return claims.find((c) => c.claimId === id);
}

/**
 * The headline sentence per intent.
 *
 * §5's requirement is structural: where the final band differs from the pre-override composite, the
 * answer shows **both** and names the override. On this portfolio every RED is override-forced, so
 * an implementation that showed only the final band would have misdescribed all 47.
 */
function headline(intent: IntentId, claims: readonly MaterialClaim[]): string {
  switch (intent) {
    case 'project.healthExplanation': {
      const finalRag = first(claims, 'rag:final');
      const composite = first(claims, 'rag:composite');
      const mechanism = first(claims, 'rag:mechanism');
      const overrides = pick(claims, 'rag:override:');
      if (finalRag === undefined) return 'The status could not be assessed.';
      const parts = [finalRag.text];
      if (composite !== undefined) parts.push(composite.text);
      if (mechanism !== undefined) parts.push(mechanism.text);
      if (overrides.length > 0) {
        // Name the rules. Whether they *decided* the band is the mechanism claim's job, not this
        // sentence's - asserting both here produced a self-contradicting answer.
        parts.push(`Overrides fired: ${overrides.map((o) => o.display ?? '').join(', ')}.`);
      }
      return parts.join(' ');
    }
    case 'project.marginDrivers': {
      const movement = first(claims, 'margin:movement');
      const coverage = first(claims, 'margin:coverage');
      return [movement?.text, coverage?.text].filter((s): s is string => s !== undefined).join(' ');
    }
    case 'project.forwardRisk': {
      const outlooks = pick(claims, 'outlook:');
      const signals = pick(claims, 'signal:').filter((c) => !c.claimId.startsWith('signal:not-evaluated:'));
      if (outlooks.length === 0) return 'No governed outlook is computable for this project.';
      return `${outlooks.map((o) => o.text).join(' ')} ${signals.length === 0
        ? 'No early-warning rule is currently firing.'
        : `${String(signals.length)} early-warning rules are firing.`}`;
    }
    case 'project.recovery': {
      const potential = first(claims, 'recovery:potential');
      const adjusted = first(claims, 'recovery:probability-adjusted');
      const none = first(claims, 'recovery:none');
      if (none !== undefined) return none.text;
      return [potential?.text, adjusted?.text].filter((s): s is string => s !== undefined).join(' ');
    }
    case 'project.confidence': {
      const rate = first(claims, 'late-detection:rate');
      const cov = first(claims, 'late-detection:coverage');
      return [rate?.text, cov?.text].filter((s): s is string => s !== undefined).join(' ');
    }
    case 'portfolio.ranking': {
      const top = pick(claims, 'rank:')[0];
      return top === undefined
        ? 'No project in your authorised set could be ranked.'
        : `${top.text} This is the first place to intervene in your authorised set.`;
    }
    case 'portfolio.reportedGreenRisk':
    case 'portfolio.systemEmergingRisk': {
      const count = claims.find((c) => c.claimId.endsWith(':count'));
      return count?.text ?? 'No finding is computable over your authorised set.';
    }
    case 'portfolio.comparison':
      return pick(claims, 'segment:').map((c) => c.text).join(' ');
    case 'project.burnProgress':
      return pick(claims, 'burn:').map((c) => c.text).join(' ');
    case 'project.scopeLeakage':
      return pick(claims, 'scope:').map((c) => c.text).join(' ');
    case 'evidence.lookup':
      return pick(claims, 'evidence:').map((c) => c.text).join(' ');
    case 'metric.definition':
      return pick(claims, 'metric:').map((c) => c.text).join(' ');
  }
}

/** The "Why" list. One line per supporting claim, in claim order, never re-worded. */
export function why(intent: IntentId, claims: readonly MaterialClaim[]): readonly string[] {
  const headlineIds = new Set<string>();
  switch (intent) {
    case 'project.healthExplanation':
      headlineIds.add('rag:final'); headlineIds.add('rag:composite'); headlineIds.add('rag:mechanism');
      break;
    case 'project.marginDrivers':
      headlineIds.add('margin:movement'); headlineIds.add('margin:coverage');
      break;
    case 'project.confidence':
      headlineIds.add('late-detection:rate'); headlineIds.add('late-detection:coverage');
      break;
    default:
      break;
  }
  return claims.filter((c) => !headlineIds.has(c.claimId)).map((c) => neutraliseRetrievedText(c.text));
}

/**
 * Joins claim sentences into prose that reads as prose.
 *
 * Claim texts are independent sentences and were concatenated raw, so an answer could read
 * *"... GM at risk $5.55M. more gross margin is at risk (tier 4) This is the first place ..."* -
 * a lowercase word after a full stop and a missing stop before the next sentence.
 *
 * **Punctuation only.** An earlier attempt inferred sentence boundaries from capitalisation and
 * split *"Final System RAG"* into *"Final. System RAG"* - inventing boundaries inside a sentence is
 * worse than the defect it fixes, so this now normalises spacing and terminal punctuation and
 * nothing else. The source claims carry their own sentence structure.
 */
function joinSentences(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .replace(/\.\.+/g, '.')
    .trim();
}

export function compose(intent: IntentId, claims: readonly MaterialClaim[]): string {
  // Neutralised at composition, once, on the way out - so a stored payload riding a claim cannot
  // reach an executive briefing as unreviewed third-party prose (Phase 11C, INJ-01a).
  return neutraliseRetrievedText(joinSentences(headline(intent, claims)));
}

/**
 * `executiveAuthority` is **derived, never chosen**.
 *
 * `QUALIFIED` is a legitimate, expected, frequent outcome - the same way `GREEN + PROVISIONAL` is.
 * A design that treats qualification as failure produces an assistant that suppresses caveats to
 * look confident, which is the failure this whole contract exists to prevent.
 */
export function authorityOf(
  claims: readonly MaterialClaim[],
  caveats: readonly Caveat[],
  validated: boolean,
): ExecutiveAuthority {
  if (!validated || claims.length === 0) return 'NOT_AUTHORITATIVE';
  if (caveats.length === 0 && claims.every((c) => isFullyAuthoritative(c.envelope))) {
    return 'AUTHORITATIVE';
  }
  return 'QUALIFIED';
}

/** The weakest status across the claim set. Absence of a status is never treated as COMPLETE. */
export function worstStatus(claims: readonly MaterialClaim[]): AssessmentStatus {
  const statuses = claims.map((c: MaterialClaim): AssessmentStatus => c.envelope.assessmentStatus);
  if (statuses.includes('NOT_COMPUTABLE')) return 'NOT_COMPUTABLE';
  if (statuses.length === 0 || statuses.includes('PROVISIONAL')) return 'PROVISIONAL';
  return 'COMPLETE';
}

/** Inputs that could not be produced, so the answer can name them rather than imply zero. */
export function missingEvidence(
  claims: readonly MaterialClaim[],
): readonly { readonly input: string; readonly state: ClaimEnvelope['signalState']; readonly reason: string }[] {
  return claims
    .filter((c) => c.envelope.signalState === 'NOT_COMPUTABLE' || c.envelope.signalState === 'CONFIGURATION_ERROR')
    .map((c) => ({
      input: c.envelope.metricId ?? c.envelope.ruleId ?? c.claimId,
      state: c.envelope.signalState,
      reason: c.text,
    }));
}

export const COMPOSER_STATE: string =
  'Deterministic templates per intent. No arithmetic, no formatting of figures, no model. '
  + 'ADR-0030 option D floor.';
