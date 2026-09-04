/**
 * The Assistant golden-truth pack (§67).
 *
 * A benchmark of **facts**, each tied to the claim that carries it. Prose is deliberately not
 * asserted: the wording is free to change and a figure is not, and a benchmark that pinned sentences
 * would fail on an improvement and pass on a wrong number in a familiar phrasing.
 *
 * Every expected value comes from the frozen Phase 12 baseline recorded in
 * `docs/RELEASE_BASELINE_FROZEN.md`. That is what makes this a cross-surface reconciliation rather
 * than a self-consistency check: the Assistant is being held to the figures the executive surfaces
 * already publish, not to figures it produced itself.
 */

export interface GoldenCase {
  /** Asked through the full path: plan, validate, governed tools, claims. */
  readonly question: string;
  /** The claim whose `display` carries the fact. */
  readonly claimId: string;
  readonly expected: string;
  /** Why this figure matters, for a reader of the results document. */
  readonly note: string;
}

export const GOLDEN_TRUTH: readonly GoldenCase[] = [
  {
    question: 'How many fixed-bid projects are in the portfolio?',
    claimId: 'aggregate:count',
    expected: '75',
    note: 'The population every executive figure is computed over.',
  },
  {
    question: 'What is the total contract value across the whole portfolio?',
    claimId: 'aggregate:tcv',
    expected: '$453.47M',
    note: 'MET-PORT-001 — the sum of MET-FIN-002 contractual revenue, which is the as-sold baseline '
      + 'plus executed change requests. The built site published $451.28M for this until ADR-0039: '
      + 'it summed the as-sold specification while the application KPI summed contractual revenue, '
      + 'and the two disagreed under one label.',
  },
  {
    question: 'What is the portfolio forecast margin across the whole portfolio?',
    claimId: 'aggregate:forecast-gm',
    expected: '20.21%',
    note: 'MET-PORT-002 — aggregate forecast revenue less aggregate cost at completion over '
      + 'aggregate forecast revenue. Weighted, never a mean of the project margins. A contract-value-'
      + 'weighted mean of percentages was the Phase 12 P0, and it agrees with this figure only where '
      + 'no change request has ever been executed.',
  },
  {
    question: 'What is the as-sold margin across the whole portfolio?',
    claimId: 'aggregate:sold-gm',
    expected: '25.46%',
    note: 'The as-sold position, aggregated on the same basis so the two are comparable.',
  },
  {
    question: 'What is the total margin at risk across the whole portfolio?',
    claimId: 'aggregate:var',
    expected: '$35.95M',
    note: 'A plain sum of per-project MET-FIN-019. Where projects share a root cause it overstates '
      + 'rather than de-duplicating, and the claim says so.',
  },
  {
    question: 'Which reported Green projects disagree with system evidence?',
    claimId: 'gar:reported:count',
    expected: '9',
    note: 'The executive category: reported GREEN while the system assesses worse. The wider '
      + 'MET-HLTH-033 metric counts 18 and is disclosed beside it under its own definition.',
  },
  {
    question: 'Which reported Green projects disagree with system evidence?',
    claimId: 'gar:reported:metric',
    expected: '18',
    note: 'The governed metric, preserved rather than suppressed, so no two numbers share a name.',
  },
  {
    question: 'Which projects have an emerging risk?',
    claimId: 'gar:system:count',
    expected: '10',
    note: 'Assessed GREEN today with a 30- or 60-day outlook that turns. Zero overlap with the '
      + 'category above, which is what ADR-0018 keeping them two findings buys.',
  },
  {
    question: 'Which projects are recovering?',
    claimId: 'recovery:count',
    expected: '4',
    note: 'Trajectory IMPROVING, read from the engine rather than re-derived.',
  },
  {
    question: 'What changed since the previous review?',
    claimId: 'change:movement',
    expected: '−$3.02M',
    note: 'Measured between two endpoints of one governed margin-trend series, which is how the '
      + 'Command Center measures it. Comparing the prior point against today would mix two bases.',
  },
  {
    question: 'What changed since the previous review?',
    claimId: 'change:reported',
    expected: '20',
    note: 'Reported-status movements: 12 downgrades and 8 upgrades.',
  },
];
