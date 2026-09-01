/**
 * Billing and cash.
 *
 * Three separate concepts, kept separate exactly as `PHASE_HANDOFF.md` §0.2 requires:
 * recognition is a Finance accounting fact, billing follows contractual milestones, and cash
 * follows the customer's payment behaviour. They routinely differ, and the gaps between them are
 * `MET-COM-006` unbilled revenue and `MET-COM-003` receivables.
 *
 * Billing lags recognition here because that is the normal direction in fixed-bid delivery: work is
 * recognised as it is performed and invoiced when a milestone permits. A generator that billed
 * exactly what it recognised would make `MET-COM-006` uniformly zero and the metric untestable.
 */
import { Money } from '@platform/decimal';
import { addDays, compareDates, type CalendarDate } from '@platform/time';
import type { InvoiceRow, PaymentRow, RecognisedRevenueFactRow } from './facts.js';
import { AS_OF } from './portfolio.js';
import { Rng, dec } from './rng.js';

export function buildBilling(
  projectId: string,
  contractId: string,
  currency: string,
  recognised: readonly RecognisedRevenueFactRow[],
  seed: string,
): { invoices: InvoiceRow[]; payments: PaymentRow[] } {
  const rng = Rng.fromSeed(`${seed}:billing:${projectId}`);
  const invoices: InvoiceRow[] = [];
  const payments: PaymentRow[] = [];

  // One billing fraction per project, drawn once. Re-drawing per period made the billed target
  // oscillate, which produced impossible invoices and a meaningless unbilled-revenue figure.
  const billedFraction = rng.range(0.82, 0.95);
  let billedToDate = 0;
  // Billing follows ORIGINAL postings only. A later accounting correction restates revenue; it does
  // not retrospectively re-issue an invoice, which is precisely why MET-COM-006 unbilled revenue and
  // MET-COM-003 receivables are separate figures from recognition.
  for (const [i, r] of recognised.filter((x) => x.postingType === 'ORIGINAL').entries()) {
    // Bill a lagged share of what has been recognised. The residual is unbilled revenue.
    const cumulative = Number(r.cumulativeAmount.amount);
    const targetBilled = cumulative * billedFraction;
    const amount = targetBilled - billedToDate;
    if (amount <= 1000) continue;
    billedToDate = targetBilled;

    const issuedOn = addDays(r.sourceTimestamp.slice(0, 10) as CalendarDate, rng.int(2, 9));
    if (compareDates(issuedOn, AS_OF) > 0) continue;
    const invoiceId = `inv-${projectId}-${i + 1}`;
    invoices.push({
      id: invoiceId, contractId, issuedOn, dueOn: addDays(issuedOn, 30),
      amount: Money.of(dec(amount), currency as never).toDto(), synthetic: true,
    });

    // Most invoices are paid; some age past due, which is what MET-COM-005 measures.
    if (rng.chance(0.86)) {
      const receivedOn = addDays(issuedOn, rng.int(24, 88));
      if (compareDates(receivedOn, AS_OF) <= 0) {
        payments.push({
          invoiceId, receivedOn,
          amount: Money.of(dec(amount), currency as never).toDto(), synthetic: true,
        });
      }
    }
  }
  return { invoices, payments };
}
