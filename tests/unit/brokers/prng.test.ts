import { describe, expect, it } from "vitest";
import { SeededRandom, combineSeeds, hashString } from "@/lib/brokers/prng";

describe("SeededRandom", () => {
  it("is deterministic for the same seed", () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("next() stays in [0, 1) and range() respects bounds", () => {
    const r = new SeededRandom(99);
    for (let i = 0; i < 5000; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const v = r.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("normal() has roughly the requested mean and sd", () => {
    const r = new SeededRandom(7);
    const n = 20_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.normal(10, 2);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it("pick() returns members and throws on empty", () => {
    const r = new SeededRandom(3);
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
    expect(() => r.pick([])).toThrow();
  });

  it("chance() honours probability edges and frequency", () => {
    const r = new SeededRandom(5);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.25, 1);
  });

  it("fork() is deterministic and independent of the parent", () => {
    const a = new SeededRandom(11).fork("x");
    const b = new SeededRandom(11).fork("x");
    const c = new SeededRandom(11).fork("y");
    expect(a.next()).toBe(b.next());
    expect(a.next()).not.toBe(c.next());
  });

  it("hashString and combineSeeds are stable", () => {
    expect(hashString("SPY")).toBe(hashString("SPY"));
    expect(hashString("SPY")).not.toBe(hashString("QQQ"));
    expect(combineSeeds(1, 2, 3)).toBe(combineSeeds(1, 2, 3));
    expect(combineSeeds(1, 2, 3)).not.toBe(combineSeeds(3, 2, 1));
  });
});
