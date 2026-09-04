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

/**
 * Facts the Assistant does not carry a claim for, checked against the governed engines directly.
 *
 * Two of §20's required figures — the RAG distribution and the as-sold/executed-CR/contractual
 * relationship — are published by the Command Center and have no Assistant claim. Adding claims for
 * them would be adding product surface to make a benchmark pass, which is the wrong way round: the
 * benchmark should reach for the figure where the product actually publishes it.
 *
 * So these are read from the Command Center view and from the portfolio the engines were fed, and
 * compared against the same frozen baseline. That makes this section a genuine cross-surface
 * reconciliation (§21) rather than a second opinion from the same source.
 */
export interface GovernedFactCase {
  readonly fact: string;
  readonly surface: string;
  readonly expected: string;
  readonly note: string;
}

export const GOVERNED_FACTS: readonly GovernedFactCase[] = [
  {
    fact: 'rag:green',
    surface: 'Command Center · ragDistribution',
    expected: '38',
    note: 'System-assessed GREEN. Distinct from *reported* GREEN, which is a management declaration.',
  },
  { fact: 'rag:amber', surface: 'Command Center · ragDistribution', expected: '22', note: 'System-assessed AMBER.' },
  { fact: 'rag:red', surface: 'Command Center · ragDistribution', expected: '15', note: 'System-assessed RED.' },
  {
    fact: 'rag:total',
    surface: 'Command Center · ragDistribution',
    expected: '75',
    note: 'The three bands account for the whole assessed population, with nothing unclassified.',
  },
  {
    fact: 'economics:as-sold-contract-value',
    surface: 'Portfolio specifications · Σ as-sold contract value',
    expected: '$451.28M',
    note: 'The as-sold baseline. This is the figure the built site once published under the label '
      + '"contract value", which ADR-0039 corrected: it is a real and useful number and it is not '
      + 'MET-PORT-001.',
  },
  {
    fact: 'economics:executed-cr-delta',
    surface: 'Contract engine · Σ executed change value delta',
    expected: '$2.19M',
    note: 'Executed change requests only. Pending changes are deliberately absent — there is no code '
      + 'path by which an unexecuted change raises contractual revenue (REQ-FIN-005).',
  },
  {
    fact: 'economics:contractual-value',
    surface: 'Command Center · KPI, and Assistant · aggregate:tcv',
    expected: '$453.47M',
    note: 'MET-PORT-001. Must equal as-sold plus executed CR delta exactly, and must equal what the '
      + 'Assistant answers, or the two surfaces are publishing different portfolios.',
  },
  {
    fact: 'economics:reconciles',
    surface: 'derived',
    expected: 'true',
    note: 'as-sold + executed CR delta = contractual value, to the cent, in decimal arithmetic. This '
      + 'is the relationship §19 requires be verified rather than asserted.',
  },
  {
    fact: 'knowledge:before',
    surface: 'Assistant · knowledge.document, before the SOW is ingested',
    expected: 'NOT_ANSWERABLE',
    note: 'The acceptance-clause question, with nothing ingested. Answerable-from-nothing would be '
      + 'the single most damaging possible result here.',
  },
  {
    fact: 'knowledge:after',
    surface: 'Assistant · knowledge.document, after the SOW is ingested',
    expected: 'ANSWERABLE',
    note: 'The same question, unchanged, after one document. What moved is the evidence, not the '
      + 'model and not the question.',
  },
  {
    fact: 'conflict:concept',
    surface: 'Conflict register · concept in dispute',
    expected: 'financial.forecastRevenue',
    note: 'Authority is per concept, not per system: Finance governs this one, and the same two '
      + 'sources could resolve the other way for a concept Finance does not originate.',
  },
  {
    fact: 'conflict:authoritative',
    surface: 'Conflict register · governing entry',
    expected: '3600000',
    note: 'Finance, which holds AUTHORITATIVE for forecast revenue on prj-002. This is the governed '
      + 'value — the one the product will stand behind.',
  },
  {
    fact: 'conflict:supplemental',
    surface: 'Conflict register · disagreeing entry',
    expected: '5100000',
    note: 'An uploaded extract, 42% higher. Disclosed, never merged, never averaged, never allowed '
      + 'to win. A last-writer-wins system would report this figure and no longer know the other '
      + 'existed, which is how a wrong number becomes an unfalsifiable one.',
  },
  {
    fact: 'authority:upload-cannot-be-authoritative',
    surface: 'Source authority registry',
    expected: 'SUPPLEMENTAL',
    note: 'Whatever the upload requested. A source that could assert its own authority could promote '
      + 'itself above Finance by sending one field (ADR-0035 §4).',
  },
];
