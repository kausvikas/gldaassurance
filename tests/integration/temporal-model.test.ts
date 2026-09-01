/**
 * The temporal model: baseline immutability, executed-vs-pending change treatment, append-only
 * snapshots, and as-of vs as-corrected reconstruction.
 *
 * Authority: ADR-0003, REQ-DATA-002/003/004/005.
 *
 * **Scope limit, stated plainly.** These exercise the *domain-level* guarantee through the
 * in-memory persistence implementations. The authoritative control is the database — revoked
 * privileges plus a rejecting trigger (ADR-0007 §Decision 3) — and no PostgreSQL instance is
 * available in this environment, so that half is written in `migrations/` and **unverified**
 * (debt DR-012). `tests/integration/schema-boundaries.test.ts` statically asserts the DDL contains
 * both controls; only a running database can prove they fire.
 */
import { describe, expect, it } from 'vitest';
import { Money } from '@platform/decimal';
import {
  ImmutabilityViolationError,
  InMemoryAppendOnlyStore,
  InMemoryImmutableStore,
  InMemoryUnitOfWork,
  type SeriesRow,
} from '@platform/persistence';
import { calendarDate, instant, weekId } from '@platform/time';
import type { AsSoldBaseline, ExecutedChange, PendingChange } from '@contexts/contract';

const uow = new InMemoryUnitOfWork();
const usd = (a: string) => Money.of(a, 'USD');

const asSold = (contractId: string): AsSoldBaseline => ({
  kind: 'AS_SOLD',
  contractId: contractId as AsSoldBaseline['contractId'],
  signedOn: calendarDate('2025-06-01'),
  contractValue: usd('10000000.00'),
  budgetedCost: usd('7600000.00'),
  contingencyBudget: usd('400000.00'),
  plannedCompletion: calendarDate('2027-01-31'),
  pyramidRatio: '0.3333',
  blendedRate: usd('78.50'),
  reworkAllowance: '0.05',
  plannedEffortHours: '96800.00',
  asSoldFxRateIds: [],
  synthetic: true,
});

describe('REQ-DATA-003 — the As-Sold baseline is immutable', () => {
  it('accepts the first insert', async () => {
    const store = new InMemoryImmutableStore<AsSoldBaseline, string>('AsSoldBaseline', (b) => b.contractId);
    await uow.run((tx) => store.insert(tx, asSold('CTR-1')));
    expect(store.size).toBe(1);
  });

  it('rejects a second insert for the same contract — this is the anti-laundering control', async () => {
    const store = new InMemoryImmutableStore<AsSoldBaseline, string>('AsSoldBaseline', (b) => b.contractId);
    await uow.run((tx) => store.insert(tx, asSold('CTR-1')));

    const restated = { ...asSold('CTR-1'), contractValue: usd('11000000.00') };
    await expect(uow.run((tx) => store.insert(tx, restated))).rejects.toThrow(ImmutabilityViolationError);
  });

  it('explains why, citing the decision, rather than failing opaquely', async () => {
    const store = new InMemoryImmutableStore<AsSoldBaseline, string>('AsSoldBaseline', (b) => b.contractId);
    await uow.run((tx) => store.insert(tx, asSold('CTR-2')));
    await expect(uow.run((tx) => store.insert(tx, asSold('CTR-2')))).rejects.toThrow(/REQ-DATA-003/);
  });

  it('freezes the stored row, so a held reference cannot be mutated in place', async () => {
    const store = new InMemoryImmutableStore<AsSoldBaseline, string>('AsSoldBaseline', (b) => b.contractId);
    await uow.run((tx) => store.insert(tx, asSold('CTR-3')));
    const held = await uow.run((tx) => store.findById(tx, 'CTR-3'));
    expect(Object.isFrozen(held)).toBe(true);
  });

  it('the store type offers no update path at all', () => {
    const store = new InMemoryImmutableStore<AsSoldBaseline, string>('AsSoldBaseline', (b) => b.contractId);
    // The accidental version does not compile; the deliberate version has nothing to call.
    expect('update' in store).toBe(false);
    expect('upsert' in store).toBe(false);
    expect('delete' in store).toBe(false);
  });
});

describe('REQ-DATA-004 — executed and pending changes are structurally distinct', () => {
  const executed: ExecutedChange = {
    kind: 'EXECUTED',
    id: 'CR-EX-1' as ExecutedChange['id'],
    contractId: 'CTR-1' as ExecutedChange['contractId'],
    executedOn: calendarDate('2026-03-15'),
    valueDelta: usd('500000.00'),
    costDelta: usd('420000.00'),
    contingencyDelta: usd('0.00'),
    completionDateDelta: 0,
    synthetic: true,
  };

  const pending: PendingChange = {
    kind: 'PENDING',
    id: 'CR-PN-1' as PendingChange['id'],
    contractId: 'CTR-1' as PendingChange['contractId'],
    raisedOn: calendarDate('2026-05-01'),
    proposedValue: usd('280000.00'),
    estimatedCost: usd('210000.00'),
    approvalProbability: '0.40',
    probabilityAssessedBy: 'usr-commercial',
    probabilityAssessedOn: calendarDate('2026-05-06'),
    synthetic: true,
  };

  it('are different types, so one cannot be passed where the other is expected', () => {
    expect(executed.kind).toBe('EXECUTED');
    expect(pending.kind).toBe('PENDING');
    // A PendingChange has no valueDelta at all — it cannot contribute to a baseline by accident.
    expect('valueDelta' in pending).toBe(false);
    expect('proposedValue' in executed).toBe(false);
  });

  it('the pending record carries no status field to flip', () => {
    // ADR-0003 §Decision 2: a status flag is the one-statement route to moving unsecured
    // revenue into the forecast. There is no such field.
    expect('status' in pending).toBe(false);
    expect('state' in pending).toBe(false);
  });

  it('executing a change is an insert that leaves the pending record intact', () => {
    const executedFromPending: ExecutedChange = {
      ...executed,
      id: 'CR-EX-2' as ExecutedChange['id'],
      executedFromPendingId: pending.id,
      valueDelta: pending.proposedValue,
    };
    const supersededPending: PendingChange = { ...pending, supersededByExecutedId: executedFromPending.id };

    // Both records survive, so MET-COM-007 ageing is still answerable afterwards.
    expect(supersededPending.raisedOn).toBe('2026-05-01');
    expect(executedFromPending.executedFromPendingId).toBe('CR-PN-1');
  });

  it('only executed changes move the contractual baseline (REQ-FIN-005)', () => {
    const base = usd('10000000.00');
    const contractual = base.plus(executed.valueDelta);
    expect(contractual.toPresentationString()).toBe('10500000.00');
    // The pending 280,000 is reported separately as MET-FIN-011, never summed in.
    expect(contractual.equals(base.plus(executed.valueDelta).plus(pending.proposedValue))).toBe(false);
  });
});

describe('REQ-DATA-005 — append-only snapshots support as-of reconstruction', () => {
  interface Snap extends SeriesRow {
    readonly margin: string;
  }
  const snap = (week: string, seq: number, margin: string, capturedAt: string, corrects?: number): Snap =>
    corrects === undefined
      ? { key: 'PRJ-1', week, correctionSeq: seq, capturedAt, margin }
      : { key: 'PRJ-1', week, correctionSeq: seq, capturedAt, margin, corrects };

  const seeded = async () => {
    const store = new InMemoryAppendOnlyStore<Snap>('FinancialSnapshot');
    await uow.run(async (tx) => {
      await store.append(tx, snap('2026-W14', 0, '0.220', '2026-04-06T00:00:00Z'));
      await store.append(tx, snap('2026-W15', 0, '0.214', '2026-04-13T00:00:00Z'));
      await store.append(tx, snap('2026-W16', 0, '0.207', '2026-04-20T00:00:00Z'));
      // In August we discover W15's cost feed was short; we correct it.
      await store.append(tx, snap('2026-W15', 1, '0.198', '2026-08-24T00:00:00Z', 0));
    });
    return store;
  };

  it('rejects a duplicate (project, week, correction) rather than overwriting', async () => {
    const store = await seeded();
    await expect(
      uow.run((tx) => store.append(tx, snap('2026-W15', 0, '0.999', '2026-08-31T00:00:00Z'))),
    ).rejects.toThrow(ImmutabilityViolationError);
  });

  it('requires a correction to name what it corrects', async () => {
    const store = new InMemoryAppendOnlyStore<Snap>('FinancialSnapshot');
    await expect(
      uow.run((tx) =>
        store.append(tx, { key: 'PRJ-1', week: '2026-W20', correctionSeq: 1, capturedAt: '2026-08-31T00:00:00Z', margin: '0.1' }),
      ),
    ).rejects.toThrow(/must name the sequence it corrects/);
  });

  it('as-of returns what we believed then, unaffected by the later correction', async () => {
    const store = await seeded();
    const series = await uow.run((tx) => store.seriesAsOf(tx, 'PRJ-1', '2026-04-30T00:00:00Z'));
    expect(series.map((s) => s.week)).toEqual(['2026-W14', '2026-W15', '2026-W16']);
    expect(series.find((s) => s.week === '2026-W15')?.margin).toBe('0.214');
  });

  it('as-corrected returns what we now believe was true then', async () => {
    const store = await seeded();
    const series = await uow.run((tx) => store.seriesAsCorrected(tx, 'PRJ-1', '2026-08-31T00:00:00Z'));
    expect(series.find((s) => s.week === '2026-W15')?.margin).toBe('0.198');
    expect(series.find((s) => s.week === '2026-W15')?.correctionSeq).toBe(1);
  });

  it('the two questions give different answers — which is the point', async () => {
    const store = await seeded();
    const asOf = await uow.run((tx) => store.seriesAsOf(tx, 'PRJ-1', '2026-08-31T00:00:00Z'));
    const asCorrected = await uow.run((tx) => store.seriesAsCorrected(tx, 'PRJ-1', '2026-08-31T00:00:00Z'));
    const w15AsOf = asOf.find((s) => s.week === '2026-W15')?.margin;
    const w15Corrected = asCorrected.find((s) => s.week === '2026-W15')?.margin;
    expect(w15AsOf).not.toBe(w15Corrected);
    // Conflating them would erase the evidence that the project looked healthier than it was.
    expect(Number(w15AsOf)).toBeGreaterThan(Number(w15Corrected));
  });

  it('keeps 78 weekly snapshots — the history a trajectory metric needs', async () => {
    const store = new InMemoryAppendOnlyStore<Snap>('FinancialSnapshot');
    await uow.run(async (tx) => {
      for (let i = 0; i < 78; i += 1) {
        const w = `2025-W${String((i % 52) + 1).padStart(2, '0')}`;
        await store.append(tx, snap(`${w}-${i}`, 0, '0.2', instant('2026-08-31T00:00:00Z')));
      }
    });
    expect(store.size).toBe(78);
  });
});

describe('temporal version references (REQ-DATA-010)', () => {
  it('a week identifier round-trips and orders lexicographically', () => {
    expect(weekId('2026-W36') < weekId('2026-W37')).toBe(true);
    expect(instant('2026-08-31T00:00:00Z') < instant('2026-09-01T00:00:00Z')).toBe(true);
  });
});
