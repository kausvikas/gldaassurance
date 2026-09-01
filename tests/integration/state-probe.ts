/**
 * A probe onto the governed per-state sentences.
 *
 * `KNOWN_ZERO`, `UNBOUNDED` and `CONFIGURATION_ERROR` are unreachable from the demo portfolio
 * (DR-066 records that the synthetic data never exercises those branches), so §14 cannot be
 * certified from portfolio data alone. Asserting them from constructed input is the honest
 * alternative; reporting them as covered because no case appeared would be the empty-set false pass.
 */
import { inputStateSentence } from '@app';

export function inputStateSentenceFor(state: string): string {
  return inputStateSentence('The input', state, null, 'no finite value');
}
