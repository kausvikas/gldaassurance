/**
 * Count grammar.
 *
 * These exist because the product shipped `1 projects` to a Command Center and `milestone(s)` into
 * governed executive prose. Neither is a hard problem; both are the kind of thing that recurs
 * forever unless the correct form is the only convenient one to reach, and a test is what stops the
 * next helper being written beside this one.
 */
import { describe, expect, it } from 'vitest';
import { countIs, countOf, pluralise } from '@platform/language';

describe('count agreement', () => {
  it('agrees a count with its noun', () => {
    expect(countOf(1, 'project')).toBe('1 project');
    expect(countOf(9, 'project')).toBe('9 projects');
    // Zero is plural in English, and "0 projects" reads as a measured empty set where "0 project"
    // reads as a bug.
    expect(countOf(0, 'project')).toBe('0 projects');
  });

  it('handles the endings this product actually uses', () => {
    expect(countOf(2, 'analysis')).toBe('2 analyses');
    expect(countOf(2, 'criterion')).toBe('2 criteria');
    expect(countOf(2, 'batch')).toBe('2 batches');
    expect(countOf(2, 'policy')).toBe('2 policies');
    expect(countOf(2, 'milestone')).toBe('2 milestones');
    // A vowel before the y is not the -ies case.
    expect(countOf(2, 'day')).toBe('2 days');
  });

  it('conjugates the verb with the count, so a caller writes one sentence', () => {
    expect(countIs(1, 'milestone', 'is forecast past baseline'))
      .toBe('1 milestone is forecast past baseline');
    expect(countIs(3, 'milestone', 'is forecast past baseline'))
      .toBe('3 milestones are forecast past baseline');
    expect(countIs(1, 'critical domain', 'has never reported'))
      .toBe('1 critical domain has never reported');
    expect(countIs(2, 'critical domain', 'has never reported'))
      .toBe('2 critical domains have never reported');
  });

  it('never emits a parenthetical plural', () => {
    for (const n of [0, 1, 2, 17]) {
      for (const noun of ['project', 'milestone', 'record', 'critical domain', 'conflict']) {
        expect(countOf(n, noun)).not.toContain('(s)');
        expect(countIs(n, noun, 'is present')).not.toContain('(s)');
      }
    }
  });

  it('preserves the caller\'s capitalisation on an irregular', () => {
    expect(pluralise('Analysis', 2)).toBe('Analyses');
    expect(pluralise('analysis', 2)).toBe('analyses');
  });
});
