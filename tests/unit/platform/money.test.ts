/**
 * `Money` — the properties ADR-0002 makes binding.
 *
 * These are Phase 1 platform-contract tests, not metric golden tests. The golden suite for
 * METRIC_CATALOG.md arrives in Phase 4 (TEST_STRATEGY.md §8) and is what proves the formulas;
 * this proves the arithmetic underneath them cannot lose a cent.
 */
import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money, isComputable } from '@platform/decimal';

const usd = (a: string) => Money.of(a, 'USD');

describe('decimal safety (ADR-0002 §Decision 1)', () => {
  it('adds the canonical float-failure case exactly', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754. Here it must be exact.
    expect(usd('0.1').plus(usd('0.2')).toDto().amount).toBe('0.3');
  });

  it('holds precision across a long chain that would drift in binary floating point', () => {
    let total = Money.zero('USD');
    for (let i = 0; i < 1000; i += 1) total = total.plus(usd('0.01'));
    expect(total.toDto().amount).toBe('10');
  });

  it('keeps sub-minor-unit precision for rates and escalations', () => {
    expect(usd('87.335').times('3').toDto().amount).toBe('262.005');
  });

  it('rejects a JS number entering through the string constructor', () => {
    expect(() => Money.of(String(0.1 + 0.2), 'USD')).not.toThrow();
    expect(Money.of(String(0.1 + 0.2), 'USD').toDto().amount).toBe('0.30000000000000004');
    // ...which is exactly why the constructor takes a string the caller wrote deliberately.
    expect(() => Money.of('1e5', 'USD')).toThrow(TypeError);
    expect(() => Money.of('abc', 'USD')).toThrow(TypeError);
  });
});

describe('money never crosses a boundary as a number (§Decision 3)', () => {
  it('serialises the amount as a string with an explicit currency', () => {
    expect(usd('1234.5678').toDto()).toEqual({ amount: '1234.5678', currency: 'USD' });
  });

  it('round-trips through its DTO without loss', () => {
    const original = usd('28000000.0001');
    expect(Money.fromDto(original.toDto()).equals(original)).toBe(true);
  });

  it('exposes no numeric coercion', () => {
    expect(Object.getOwnPropertyNames(Money.prototype)).not.toContain('valueOf');
  });
});

describe('currency is explicit (§Decision 6, REQ-DATA-006)', () => {
  it('throws rather than silently summing mixed currencies', () => {
    expect(() => usd('100').plus(Money.of('100', 'EUR'))).toThrow(CurrencyMismatchError);
  });

  it('names both currencies and the governing decision in the error', () => {
    expect(() => usd('1').minus(Money.of('1', 'JPY'))).toThrow(/USD and JPY/);
  });

  it('refuses comparison across currencies too', () => {
    expect(() => usd('1').compare(Money.of('1', 'GBP'))).toThrow(CurrencyMismatchError);
  });
});

describe('aggregation is order-independent and associative (§Decision 7, REQ-FIN-008)', () => {
  const amounts = [
    '1234.56', '0.01', '999999.99', '0.004', '87.335', '-450.10', '12.5', '0',
  ].map(usd);

  it('produces an identical total under any ordering', () => {
    const reference = Money.sum(amounts, 'USD').toDto().amount;
    for (let trial = 0; trial < 50; trial += 1) {
      const shuffled = [...amounts].sort(() => Math.random() - 0.5);
      expect(Money.sum(shuffled, 'USD').toDto().amount).toBe(reference);
    }
  });

  it('is associative regardless of grouping', () => {
    const [a, b, c] = [usd('0.1'), usd('0.2'), usd('0.3')];
    expect(a.plus(b).plus(c).equals(a.plus(b.plus(c)))).toBe(true);
  });
});

describe('division guards (§Decision 8, METRIC_CATALOG.md §1.1 rule 5)', () => {
  it('returns NOT_COMPUTABLE on a zero denominator rather than Infinity', () => {
    const r = usd('100').dividedBy(Money.zero('USD'));
    expect(r.computable).toBe(false);
    if (!r.computable) expect(r.reason).toBe('ZERO_DENOMINATOR');
  });

  it('computes an ordinary ratio', () => {
    const r = usd('25').dividedBy(usd('100'));
    expect(isComputable(r)).toBe(true);
    if (isComputable(r)) expect(r.value.toFixed(2)).toBe('0.25');
  });
});

describe('largest-remainder allocation (§Decision 5) — the AC-4 mechanism', () => {
  it('splits a whole into parts that sum exactly back to it', () => {
    const parts = usd('100').allocate(['1', '1', '1']);
    expect(parts.map((p) => p.toPresentationString())).toEqual(['33.34', '33.33', '33.33']);
    expect(Money.sum(parts, 'USD').equals(usd('100'))).toBe(true);
  });

  it('reconciles a decomposition of an awkward total to the cent', () => {
    const parts = usd('0.05').allocate(['1', '1', '1', '1', '1', '1', '1']);
    expect(Money.sum(parts, 'USD').toPresentationString()).toBe('0.05');
  });

  it('handles a zero-decimal currency at its own scale', () => {
    const parts = Money.of('1000', 'JPY').allocate(['1', '2']);
    expect(parts.map((p) => p.toPresentationString())).toEqual(['333', '667']);
    expect(Money.sum(parts, 'JPY').toPresentationString()).toBe('1000');
  });

  it('allocates a negative total without losing the remainder', () => {
    const parts = usd('-100').allocate(['1', '1', '1']);
    expect(Money.sum(parts, 'USD').equals(usd('-100'))).toBe(true);
  });

  it('refuses weights that sum to zero rather than dividing by zero', () => {
    expect(() => usd('100').allocate(['1', '-1'])).toThrow(RangeError);
  });
});

describe('rounding is half-up and presentation-only (§Decision 5)', () => {
  it('rounds half-up, matching invoice arithmetic rather than banker\'s rounding', () => {
    expect(usd('2.345').toPresentationString()).toBe('2.35');
    expect(usd('2.355').toPresentationString()).toBe('2.36');
    // Banker's rounding would give 2.34 and 2.36 respectively.
  });

  it('does not round the stored value', () => {
    expect(usd('2.3456789').toDto().amount).toBe('2.3456789');
  });
});

describe('immutability', () => {
  it('returns new instances and leaves operands untouched', () => {
    const a = usd('10');
    const b = a.plus(usd('5'));
    expect(a.toDto().amount).toBe('10');
    expect(b.toDto().amount).toBe('15');
    expect(Object.isFrozen(a)).toBe(true);
  });
});
