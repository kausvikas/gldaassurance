/**
 * The Project Identity Hub (ADR-0035 §8).
 *
 * Every enterprise data platform eventually meets two projects called "Atlas". One is a $40M
 * transformation for an automotive client; the other is a $600k support engagement in a different
 * region. A fuzzy match between them is not an edge case, and the failure is silent in the worst
 * possible way: costs from one land against the margin of the other, and the resulting figure looks
 * entirely plausible.
 *
 * So this module resolves identity **only** through explicitly declared mappings, and returns
 * `UNRESOLVED` for anything else. There is no similarity function here, no token-set ratio, no
 * "confidence above 0.9 auto-accepts". A row whose identity is not declared is quarantined, and a
 * human declares the mapping — which is slower, and is the only version of this that can be trusted
 * with a cost figure.
 */

/** The systems a Delivery Intelligence project may be known to. Closed; adding one is an adapter. */
export type SourceSystem =
  | 'DELIVERY_INTELLIGENCE'
  | 'FINANCE_ERP'
  | 'SALESFORCE'
  | 'PSA'
  | 'ALM'
  | 'DELIVERY_ASSURANCE'
  | 'TABLEAU'
  | 'UPLOAD';

export const ALL_SOURCE_SYSTEMS: readonly SourceSystem[] = [
  'DELIVERY_INTELLIGENCE', 'FINANCE_ERP', 'SALESFORCE', 'PSA', 'ALM', 'DELIVERY_ASSURANCE',
  'TABLEAU', 'UPLOAD',
];

export interface IdentityMapping {
  readonly projectId: string;
  readonly system: SourceSystem;
  /** The identifier as that system writes it. Compared exactly, after case folding only. */
  readonly externalId: string;
  /** Who or what declared this mapping. Rendered on the identity surface. */
  readonly declaredBy: string;
}

export type IdentityResolution =
  | { readonly kind: 'RESOLVED'; readonly projectId: string; readonly via: IdentityMapping }
  | { readonly kind: 'UNRESOLVED'; readonly reason: UnresolvedReason; readonly candidateCount: number };

/**
 * Why an identifier did not resolve.
 *
 * `AMBIGUOUS` is separated from `NOT_MAPPED` because they need different human actions: one is a
 * missing mapping, the other is a duplicate mapping that must be corrected before anything from that
 * source can be trusted. Collapsing them into "unknown project" would hide a data-governance defect
 * behind a data-entry one.
 */
export type UnresolvedReason = 'NOT_MAPPED' | 'AMBIGUOUS' | 'BLANK';

export class ProjectIdentityHub {
  readonly #mappings: IdentityMapping[] = [];

  declare(mapping: IdentityMapping): void {
    const key = normalise(mapping.externalId);
    if (key === '') return;
    const existing = this.#mappings.findIndex(
      (m) => m.system === mapping.system && normalise(m.externalId) === key,
    );
    if (existing >= 0) this.#mappings[existing] = mapping;
    else this.#mappings.push(mapping);
  }

  declareAll(mappings: readonly IdentityMapping[]): void {
    for (const m of mappings) this.declare(m);
  }

  /**
   * Resolves one external identifier.
   *
   * Case and surrounding whitespace are folded, because `PRJ-011` and `prj-011` are the same
   * identifier written by two systems with different conventions. **Nothing else is folded** — not
   * punctuation, not separators, not a numeric suffix — because each of those turns a distinct
   * identifier into a collision.
   */
  resolve(system: SourceSystem, externalId: string): IdentityResolution {
    const key = normalise(externalId);
    if (key === '') return { kind: 'UNRESOLVED', reason: 'BLANK', candidateCount: 0 };
    const matches = this.#mappings.filter(
      (m) => m.system === system && normalise(m.externalId) === key,
    );
    const first = matches[0];
    if (first === undefined) return { kind: 'UNRESOLVED', reason: 'NOT_MAPPED', candidateCount: 0 };
    if (matches.length > 1 && new Set(matches.map((m) => m.projectId)).size > 1) {
      return { kind: 'UNRESOLVED', reason: 'AMBIGUOUS', candidateCount: matches.length };
    }
    return { kind: 'RESOLVED', projectId: first.projectId, via: first };
  }

  /** Every system this project is known to, for the identity panel. */
  identitiesOf(projectId: string): readonly IdentityMapping[] {
    return this.#mappings
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.system.localeCompare(b.system));
  }

  /** Coverage per system: how many of the given projects have a declared mapping. */
  coverage(projectIds: readonly string[]): readonly {
    readonly system: SourceSystem;
    readonly mapped: number;
    readonly total: number;
  }[] {
    return ALL_SOURCE_SYSTEMS.filter((s) => s !== 'DELIVERY_INTELLIGENCE').map((system) => ({
      system,
      mapped: projectIds.filter(
        (id) => this.#mappings.some((m) => m.system === system && m.projectId === id),
      ).length,
      total: projectIds.length,
    }));
  }

  all(): readonly IdentityMapping[] {
    return [...this.#mappings];
  }

  get size(): number {
    return this.#mappings.length;
  }
}

function normalise(id: string): string {
  return id.trim().toLowerCase();
}
