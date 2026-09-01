/**
 * Compile-time proof that money cannot be treated as a number.
 *
 * `PHASE_HANDOFF.md` §3.5: "Money cannot be added with `+` (type error)."
 * ADR-0002 §Verification: "Type-level test that `Money + Money` does not compile."
 *
 * Each `@ts-expect-error` below is an assertion in its own right: if the expression it guards
 * ever *does* compile, `tsc` fails with "Unused '@ts-expect-error' directive" and the build
 * breaks. The runtime test at the bottom exists so the suite reports these as tests; the real
 * verification is `npm run typecheck`.
 */
import { describe, expect, it } from 'vitest';
import { Money } from '@platform/decimal';

const a = Money.of('10.00', 'USD');
const b = Money.of('5.00', 'USD');

/** Never executed. Present so the compiler evaluates it. */
function typeLevelAssertions(): void {
  // @ts-expect-error — Money is a value object; `+` on it is a compile error, not a sum.
  void (a + b);

  // @ts-expect-error — nor may it be subtracted with an operator.
  void (a - b);

  // @ts-expect-error — nor multiplied.
  void (a * 2);

  // Known limitation, recorded rather than glossed: TypeScript does *not* reject relational
  // operators between two object types, so `a < b` compiles and compares object references.
  // `Money.compare()` exists for ordering, and this gap is carried as debt DR-008.

  // @ts-expect-error — a raw number may not be used where Money is required.
  void a.plus(15);

  // @ts-expect-error — nor may a plain object impersonate Money (the brand blocks it).
  void a.plus({ amount: '15', currency: 'USD' });

  // @ts-expect-error — the constructor rejects a JS number outright.
  void Money.of(10, 'USD');

  // @ts-expect-error — an unsupported currency code is not assignable.
  void Money.of('10', 'XYZ');

  // @ts-expect-error — Money is immutable; its internals are not reachable.
  void a.value;

  // Permitted: arithmetic through methods.
  void a.plus(b).minus(b).times('2');
}

describe('Money type safety', () => {
  it('holds eight compile-time assertions enforced by `npm run typecheck`', () => {
    expect(typeof typeLevelAssertions).toBe('function');
  });

  it('offers method arithmetic as the only route', () => {
    expect(a.plus(b).toDto().amount).toBe('15');
  });
});
