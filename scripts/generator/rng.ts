/**
 * Deterministic pseudo-random number generation.
 *
 * `SYNTHETIC_DATA_SPEC.md` G1: a fixed seed produces byte-identical output. No wall-clock, no
 * unseeded randomness, no `Math.random()` (REQ-DATA-007, AC-7).
 *
 * Two properties beyond determinism matter:
 *
 * 1. **Stream independence.** Each project derives its own generator from the master seed and its
 *    own id, so changing how one project is generated does not shift every other project's numbers.
 *    Without it, any edit invalidates the whole portfolio and the content hash stops being a useful
 *    signal about what actually changed.
 * 2. **No ambient state.** The generator is a value, passed explicitly. There is no module-level
 *    counter that a reordering of calls could perturb.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  private constructor(seed: string) {
    this.next = mulberry32(xmur3(seed)());
  }

  static fromSeed(seed: string): Rng {
    return new Rng(seed);
  }

  /** A named child stream, independent of its siblings. */
  derive(label: string): Rng {
    return Rng.fromSeed(`${label}`);
  }

  float(): number {
    return this.next();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /**
   * Approximately normal in [-1, 1], via the mean of three uniforms. Bounded so a tail draw can
   * never produce a physically impossible value such as negative effort — the validator would catch
   * it, but a generator that relies on its validator to stay plausible is the wrong shape.
   */
  jitter(): number {
    return (this.next() + this.next() + this.next()) / 1.5 - 1;
  }

  /** A decimal string. Money and rates never enter the domain as JS numbers (ADR-0002). */
  decimal(min: number, max: number, dp: number): string {
    return this.range(min, max).toFixed(dp);
  }
}

/** Fixed-point decimal string from a JS number, used only at the generator boundary. */
export function dec(value: number, dp = 2): string {
  return value.toFixed(dp);
}
