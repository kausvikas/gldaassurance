/**
 * Count grammar — the one place a number and its noun are put together.
 *
 * ## Why this is a platform module and not a helper someone inlines
 *
 * The product had six independent renderings of the same sentence shape, and they disagreed. Three
 * wrote `milestone(s)`, `domain(s)`, `record(s)` — a parenthetical that reads as a form field rather
 * than as executive prose. One wrote `1 projects` in the Command Center's movement panel, on a
 * screen shown to a CDO. Each was locally trivial and the set of them was not: a product that cannot
 * say "1 project" is a product whose care shows unevenly, and unevenness is exactly what a reader
 * generalises from.
 *
 * The fix is not to correct six call sites. It is to make the correct form the *only* form that is
 * convenient to reach, so the seventh call site inherits it. That is why this lives in `@platform`
 * with no dependencies: everything above it can use it, and nothing needs to know where it is.
 *
 * ## What it deliberately does not do
 *
 * No pluralisation library, no locale machinery, no inflection rules. English count agreement for
 * the nouns this product actually uses is a one-line rule plus a short table of irregulars, and a
 * dependency here would be a dependency in the deployment that parses untrusted uploads.
 */

/**
 * Nouns whose plural is not formed by adding `s`.
 *
 * Kept short and explicit. A noun that is not here gets `s` appended, which is correct for every
 * count noun in this product's vocabulary — project, milestone, domain, record, signal, conflict,
 * source, driver, intervention, week, page, chunk, row, column.
 */
const IRREGULAR: Readonly<Record<string, string>> = {
  analysis: 'analyses',
  basis: 'bases',
  criterion: 'criteria',
  is: 'are',
  was: 'were',
  has: 'have',
  this: 'these',
  it: 'they',
};

/** The plural of a noun, without a number attached. */
export function pluralise(noun: string, count: number): string {
  if (count === 1) return noun;
  const irregular = IRREGULAR[noun.toLowerCase()];
  if (irregular !== undefined) {
    // Preserve the caller's capitalisation rather than imposing ours.
    return noun[0] === noun[0]?.toUpperCase() && noun !== noun.toUpperCase()
      ? irregular[0]?.toUpperCase() + irregular.slice(1)
      : irregular;
  }
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * A count and its noun, agreeing.
 *
 * ```
 * countOf(1, 'project')  // "1 project"
 * countOf(9, 'project')  // "9 projects"
 * countOf(0, 'project')  // "0 projects"   — zero is plural in English
 * ```
 *
 * Zero takes the plural, which is the English rule and also the more useful one here: "0 projects"
 * reads as a measured empty set, where "0 project" reads as a bug.
 */
export function countOf(count: number, noun: string): string {
  return `${String(count)} ${pluralise(noun, count)}`;
}

/**
 * A count, its noun, and a verb that agrees with both.
 *
 * ```
 * countIs(1, 'milestone', 'is forecast past baseline')
 * // "1 milestone is forecast past baseline"
 * countIs(3, 'milestone', 'is forecast past baseline')
 * // "3 milestones are forecast past baseline"
 * ```
 *
 * The verb is given in its singular form and conjugated here, so a caller writes the sentence once
 * rather than branching on the count — which is where the `(s)` forms came from in the first place.
 */
export function countIs(count: number, noun: string, predicate: string): string {
  const [verb, ...rest] = predicate.split(' ');
  if (verb === undefined) return countOf(count, noun);
  return `${countOf(count, noun)} ${pluralise(verb, count)}${rest.length === 0 ? '' : ` ${rest.join(' ')}`}`;
}

export const LANGUAGE_STATE: string =
  'Count agreement only. No locale machinery, no inflection library, no dependency.' as const;
