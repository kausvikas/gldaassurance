/**
 * No governed prose says `1 projects`, and none says `milestone(s)`.
 *
 * A unit test on the grammar helper proves the helper works. It does not prove the product uses it —
 * and the defect was never the helper, it was six call sites that each built the sentence
 * themselves. This asserts the property at the level it was breached: over the strings the product
 * actually produces, and over the sources that produce them.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

describe('executive prose agrees with its counts', () => {
  it('contains no parenthetical plural anywhere it could reach a reader', () => {
    const offenders: string[] = [];
    for (const path of [...sources('src'), ...sources('scripts/design')]) {
      const text = readFileSync(path, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        /*
         * Three exclusions, each for a reason rather than to make the test pass.
         *
         * A comment line may legitimately *quote* the defect — the grammar module's own header does,
         * and a test that forbade discussing the problem would be absurd. An arrow function writes
         * `(s) =>` and means a parameter. And a template placeholder inside a schema description is
         * not prose a reader ever sees.
         */
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        if (line.includes('=>')) continue;
        if (!/['"`][^'"`]*\(s\)/.test(line)) continue;
        offenders.push(`${path}:${String(i + 1)}`);
      }
    }
    expect(offenders, 'use countOf/countIs from @platform/language').toEqual([]);
  });

  it('never concatenates a bare count onto a hard-coded plural noun', () => {
    /*
     * The `1 projects` shape: a number glued to a noun that is always plural. The client runtime is
     * the file this was found in, and it is a template literal rather than a module, so a static
     * check over the source is the only place it can be caught before a browser shows it.
     */
    const runtime = readFileSync('scripts/design/gl-runtime.ts', 'utf8');
    const bad = runtime.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => / \+ '\s*(projects|milestones|conflicts|sources|records)\b/.test(line));
    expect(bad.map((b) => `gl-runtime.ts:${String(b.n)}`)).toEqual([]);
  });
});
