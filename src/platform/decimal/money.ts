/**
 * `Money` — the decimal-safe monetary value object.
 *
 * Authority: ADR-0002. Binding properties, each covered by a test:
 *   1. Fixed-scale decimal arithmetic; never IEEE-754 (ADR-0002 §Decision 1).
 *   2. `Money` is an object, not a number — `a + b` is a *compile* error (§Decision 2).
 *   3. It never crosses a boundary as a JS `number`; serialisation is a string (§Decision 3).
 *   4. Intermediate computation carries full precision; rounding is presentation-only (§Decision 5).
 *   5. Currency is explicit; mixed-currency arithmetic throws rather than silently summing (§6).
 *   6. Aggregation is order-independent and associative (§Decision 7, REQ-FIN-008).
 *   7. Division guards return NOT_COMPUTABLE rather than NaN/Infinity (§Decision 8).
 */
import Decimal from 'decimal.js';
import {
  type CurrencyCode,
  CurrencyMismatchError,
  isCurrencyCode,
  minorUnits,
} from './currency.js';
import { type Ratio, notComputable, ratio } from './ratio.js';

// 34 significant digits: IEEE-754 decimal128 territory, far beyond any portfolio figure.
// ROUND_HALF_UP is the single rounding policy (ADR-0002 §Decision 5) and is applied only
// where a scale is explicitly requested.
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -34, toExpPos: 34 });

/** Serialised form. Amount is a string so no float ever appears on the wire. */
export interface MoneyDto {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export class Money {
  /**
   * Nominal-typing brand. Its presence is what makes `money + money` a TypeScript error
   * rather than a silent string concatenation, and what prevents a plain object from
   * being passed where `Money` is required.
   */
  private readonly __moneyBrand!: never;

  private constructor(
    private readonly value: Decimal,
    readonly currency: CurrencyCode,
  ) {
    Object.freeze(this);
  }

  /**
   * The only constructor. Accepts a decimal *string* — never a JS `number`, because a
   * `number` literal has already lost precision before this function is reached.
   */
  static of(amount: string, currency: CurrencyCode): Money {
    if (!/^-?\d+(\.\d+)?$/.test(amount.trim())) {
      throw new TypeError(
        `Money.of expects a plain decimal string, received "${amount}". ` +
          `Scientific notation and JS numbers are rejected by design (ADR-0002 §Decision 3).`,
      );
    }
    return new Money(new D(amount.trim()), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(new D(0), currency);
  }

  static fromDto(dto: MoneyDto): Money {
    if (!isCurrencyCode(dto.currency)) {
      throw new TypeError(`Unsupported currency code "${dto.currency}".`);
    }
    return Money.of(dto.amount, dto.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  /** Scalar multiplication. The scalar is a decimal string or Decimal, never a float. */
  times(scalar: string | Decimal): Money {
    return new Money(this.value.times(new D(scalar)), this.currency);
  }

  negated(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.value.abs(), this.currency);
  }

  /**
   * Ratio of two amounts in the same currency. Returns NOT_COMPUTABLE on a zero
   * denominator — never NaN, never Infinity, never a silent dash
   * (ADR-0002 §Decision 8, METRIC_CATALOG.md §1.1 rule 5).
   */
  dividedBy(other: Money): Ratio {
    this.assertSameCurrency(other);
    if (other.value.isZero()) {
      return notComputable('ZERO_DENOMINATOR');
    }
    return ratio(this.value.dividedBy(other.value));
  }

  /**
   * Divide by a unitless quantity — `cost ÷ physical completion` for MET-FIN-029.
   * Returns `null` on a zero divisor rather than Infinity (ADR-0002 §Decision 8).
   */
  dividedByQuantity(divisor: string): Money | null {
    const q = new D(divisor);
    return q.isZero() ? null : new Money(this.value.dividedBy(q), this.currency);
  }

  /** The amount as a unitless decimal string, for ratio arithmetic in the domain. */
  toQuantity(): string {
    return this.value.toFixed();
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  /** -1 | 0 | 1 */
  compare(other: Money): number {
    this.assertSameCurrency(other);
    return this.value.comparedTo(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  /**
   * Sum. Order-independent and associative by construction (REQ-FIN-008).
   * An empty list has no inferable currency, so the currency is required.
   */
  static sum(items: readonly Money[], currency: CurrencyCode): Money {
    return items.reduce<Money>((acc, m) => acc.plus(m), Money.zero(currency));
  }

  /**
   * Largest-remainder allocation (ADR-0002 §Decision 5). Splits this amount across
   * `weights` at the currency's minor-unit scale such that the parts sum **exactly**
   * to the whole. This is the mechanism that keeps the Phase 9 margin bridge from
   * showing a rounding residual (AC-4).
   */
  allocate(weights: readonly (string | Decimal)[]): Money[] {
    if (weights.length === 0) return [];
    const scale = minorUnits(this.currency);
    const decimalWeights = weights.map((w) => new D(w));
    const totalWeight = decimalWeights.reduce((a, w) => a.plus(w), new D(0));
    if (totalWeight.isZero()) {
      throw new RangeError('Cannot allocate across weights that sum to zero.');
    }

    const unit = new D(10).toPower(-scale);
    const exact = decimalWeights.map((w) => this.value.times(w).dividedBy(totalWeight));
    const floored = exact.map((e) => e.dividedBy(unit).floor().times(unit));
    const allocated = floored.reduce((a, f) => a.plus(f), new D(0));
    let remainderUnits = this.value.minus(allocated).dividedBy(unit).round().toNumber();

    // Distribute the remaining minor units to the largest fractional remainders first.
    const order = exact
      .map((e, i) => ({ i, frac: e.minus(floored[i] as Decimal) }))
      .sort((a, b) => b.frac.comparedTo(a.frac));

    const result = [...floored];
    const step = remainderUnits >= 0 ? unit : unit.negated();
    let cursor = 0;
    while (remainderUnits !== 0 && order.length > 0) {
      const idx = (order[cursor % order.length] as { i: number }).i;
      result[idx] = (result[idx] as Decimal).plus(step);
      remainderUnits += remainderUnits > 0 ? -1 : 1;
      cursor += 1;
    }

    return result.map((r) => new Money(r, this.currency));
  }

  /**
   * Presentation rounding — half-up at the ISO 4217 minor-unit scale.
   * Domain code must not call this: rounding is presentation-only (ADR-0002 §Decision 5).
   */
  toPresentationString(): string {
    return this.value.toFixed(minorUnits(this.currency), Decimal.ROUND_HALF_UP);
  }

  /** Full-precision serialisation. This is what crosses an application boundary. */
  toDto(): MoneyDto {
    return { amount: this.value.toFixed(), currency: this.currency };
  }

  toJSON(): MoneyDto {
    return this.toDto();
  }

  toString(): string {
    return `${this.value.toFixed()} ${this.currency}`;
  }
}
