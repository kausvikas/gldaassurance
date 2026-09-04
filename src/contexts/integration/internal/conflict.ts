/**
 * The source conflict engine (ADR-0035 §6).
 *
 * A conflict is: same project, same canonical concept, same effective period, materially different
 * values from two sources. The engine detects it, names the governed value by authority, and
 * **discloses the disagreement**. It never merges, never averages, never picks the newest, and never
 * asks a model.
 *
 * The reason last-writer-wins is prohibited rather than discouraged: it does not produce a wrong
 * number, it produces an *unfalsifiable* one. A controller asking "why does this say $4.8M when my
 * ledger says $5.1M" gets no answer from a system that silently took one of them, because the system
 * no longer knows the other existed. Detection is what turns that into a two-line answer.
 *
 * **Materiality is a threshold, not equality.** Two sources reporting 4,800,000 and 4,800,000.02 are
 * not in conflict; flagging them would bury the real disagreements under rounding noise, which is
 * the practical way a conflict register becomes something nobody reads.
 */
import { qAbs, qCompare, qDiv, qSub, qty } from '@platform/decimal';
import type { SourceAuthorityClass } from '@platform/provenance';
import { outranks } from '@platform/provenance';
import type { CanonicalConcept } from './authority.js';
import type { ConceptObservation } from './staging.js';

/**
 * When two numeric values count as disagreeing.
 *
 * Relative, with an absolute floor so that a small concept does not become permanently conflicted by
 * rounding. Both are POC configuration and both are rendered next to the conflict register, because
 * a materiality threshold nobody can see is a filter on the truth.
 */
export interface MaterialityPolicy {
  /** Fractional difference above which two numbers are in conflict, e.g. `0.005` for half a point. */
  readonly relative: string;
  /** Absolute difference below which nothing is a conflict, whatever the ratio says. */
  readonly absoluteFloor: string;
}

export const POC_MATERIALITY: MaterialityPolicy = { relative: '0.005', absoluteFloor: '1' };

export const MATERIALITY_PROVENANCE =
  'POC materiality configuration — not an approved GlobalLogic reconciliation threshold' as const;

export interface ConflictEntry {
  readonly sourceId: string;
  readonly authority: SourceAuthorityClass;
  readonly value: string;
  readonly observedAt: string | null;
  readonly sourceVersion: string;
}

/**
 * One recorded disagreement.
 *
 * `governedValue` is the value the product will use and stand behind. `entries` holds every source
 * that spoke, including the loser, with its authority — so the disclosure can be written as
 * *"Finance, which is authoritative for actual cost, reports X; an uploaded supplemental workbook
 * reports Y"* rather than as an unattributed warning.
 */
export interface SourceConflict {
  readonly conflictId: string;
  readonly projectId: string;
  readonly concept: CanonicalConcept;
  readonly period: string;
  readonly governedSourceId: string;
  readonly governedAuthority: SourceAuthorityClass;
  readonly governedValue: string;
  readonly entries: readonly ConflictEntry[];
  /** `true` when no source outranks the others, which is a governance defect, not a data one. */
  readonly unresolvedAuthority: boolean;
}

/**
 * Detects conflicts across a set of observations.
 *
 * Observations are grouped by (project, concept, period). Within a group, the governing observation
 * is the highest-authority one; every other value is compared against it, and a material difference
 * becomes a recorded entry.
 *
 * A group where the two top observations share the same authority class produces
 * `unresolvedAuthority: true`. That is deliberately *not* resolved by recency or by source name: an
 * arbitrary tie-break here would be the same defect as last-writer-wins, wearing a different hat.
 * The registry is supposed to make ties impossible, and a tie reaching this function means the
 * registry is wrong and someone needs to say so.
 */
export function detectConflicts(
  observations: readonly ConceptObservation[],
  policy: MaterialityPolicy = POC_MATERIALITY,
): readonly SourceConflict[] {
  const groups = new Map<string, ConceptObservation[]>();
  for (const o of observations) {
    const key = `${o.projectId}|${o.concept}|${o.period}`;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [o]); else list.push(o);
  }

  const out: SourceConflict[] = [];
  for (const [key, group] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (group.length < 2) continue;
    const ordered = [...group].sort(
      (a, b) => (outranks(a.authority, b.authority) ? -1 : outranks(b.authority, a.authority) ? 1 : 0),
    );
    const governing = ordered[0];
    if (governing === undefined) continue;

    const disagreeing = ordered.slice(1).filter(
      (o) => o.sourceId !== governing.sourceId && isMaterial(governing, o, policy),
    );
    if (disagreeing.length === 0) continue;

    const second = ordered[1];
    const unresolvedAuthority = second !== undefined
      && !outranks(governing.authority, second.authority)
      && isMaterial(governing, second, policy);

    out.push({
      conflictId: `cf-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
      projectId: governing.projectId,
      concept: governing.concept,
      period: governing.period,
      governedSourceId: governing.sourceId,
      governedAuthority: governing.authority,
      governedValue: governing.value,
      entries: [governing, ...disagreeing].map(toEntry),
      unresolvedAuthority,
    });
  }
  return out;
}

function toEntry(o: ConceptObservation): ConflictEntry {
  return {
    sourceId: o.sourceId,
    authority: o.authority,
    value: o.value,
    observedAt: o.observedAt,
    sourceVersion: o.sourceVersion,
  };
}

/**
 * Whether two observations of the same concept materially disagree.
 *
 * Categorical values disagree on inequality — there is no "nearly Amber". Numeric values disagree
 * when they clear both the absolute floor and the relative threshold, and all of that arithmetic is
 * decimal, because a materiality check performed in floating point can itself manufacture a
 * conflict at the sixteenth significant figure.
 */
export function isMaterial(
  a: ConceptObservation, b: ConceptObservation, policy: MaterialityPolicy,
): boolean {
  if (a.kind === 'CATEGORICAL' || b.kind === 'CATEGORICAL') {
    return a.value.trim().toUpperCase() !== b.value.trim().toUpperCase();
  }
  let av: ReturnType<typeof qty>;
  let bv: ReturnType<typeof qty>;
  try {
    av = qty(a.value);
    bv = qty(b.value);
  } catch {
    // A value that is not decimal-parseable cannot be compared numerically. Treated as a
    // disagreement rather than as a match, because silently matching two unparseable values would
    // hide the very data-quality defect that produced them.
    return a.value.trim() !== b.value.trim();
  }
  const difference = qAbs(qSub(av, bv));
  if (qCompare(difference, qty(policy.absoluteFloor)) <= 0) return false;
  const base = qAbs(av);
  if (qCompare(base, qty('0')) === 0) return true;
  const relative = qDiv(difference, base);
  if (relative === null) return true;
  return qCompare(relative, qty(policy.relative)) > 0;
}
