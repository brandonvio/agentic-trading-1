/**
 * Seeded pseudo-random number generator for deterministic seed data.
 *
 * Deliberately local to lib/seed (no cross-module dependency) so the seed
 * dataset is reproducible regardless of how other mocks evolve.
 */

/** mulberry32: small, fast, good-enough 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Prng {
  private readonly rand: () => number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    this.rand = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.rand();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.rand();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Normally distributed sample (Box-Muller). */
  normal(mean = 0, stdDev = 1): number {
    if (this.spareNormal !== null) {
      const v = this.spareNormal;
      this.spareNormal = null;
      return mean + stdDev * v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.rand();
    while (v === 0) v = this.rand();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2.0 * Math.PI * v);
    const z1 = mag * Math.sin(2.0 * Math.PI * v);
    this.spareNormal = z1;
    return mean + stdDev * z0;
  }

  /** Pick one element uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Prng.pick: empty array");
    return items[Math.floor(this.rand() * items.length)];
  }

  /** Pick one element with the given relative weights. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.rand() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r <= 0) return item;
    }
    return items[items.length - 1][0];
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.rand() < p;
  }

  /** Returns a shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** `count` distinct elements sampled without replacement. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.min(count, items.length));
  }
}
