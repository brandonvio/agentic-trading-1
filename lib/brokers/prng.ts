/**
 * Seeded, deterministic pseudo-random number generation for the mock broker
 * layer. Nothing in `lib/brokers` may call `Math.random()`; every stochastic
 * decision (slippage, partial fills, price paths, latency) flows from a seed so
 * tests and demos are reproducible.
 *
 * Generator: mulberry32 (32-bit state, period ~2^32, good statistical quality
 * for simulation purposes and trivially portable).
 */

/** FNV-1a 32-bit hash of a string, used to derive per-symbol seeds. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes several integers into one 32-bit seed (order-sensitive). */
export function combineSeeds(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= (p | 0) + 0x7f4a7c15 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Deterministic PRNG with the helpers the broker mocks need. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Normally distributed sample (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    let u1 = this.next();
    while (u1 <= Number.EPSILON) u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }

  /** Uniformly picks one element; throws on an empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("SeededRandom.pick: empty array");
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** Spawns an independent generator whose seed derives from this one plus a tag. */
  fork(tag: string | number): SeededRandom {
    const tagSeed = typeof tag === "string" ? hashString(tag) : tag;
    return new SeededRandom(combineSeeds(this.state, tagSeed, Math.floor(this.next() * 0xffffffff)));
  }
}
