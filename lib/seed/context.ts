/**
 * Shared generation context threaded through every data module: a seeded
 * PRNG, a sequential id generator, the fixed "now", and time helpers.
 */
import { SequentialIdGenerator } from "@/lib/core/ids";
import type { AssetClass, Instrument } from "@/lib/domain/instrument";
import { Prng } from "./prng";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** An instrument together with the reference price/volatility the seed anchors to. */
export interface InstrumentRef {
  instrument: Instrument;
  /** Reference (current) price in the instrument's quote currency. */
  price: number;
  /** Annualised volatility of the log price (logit space for event contracts). */
  vol: number;
  /** Typical full-session volume. */
  dailyVolume: number;
}

export class SeedContext {
  readonly rng: Prng;
  readonly ids: SequentialIdGenerator;
  readonly now: Date;
  readonly nowIso: string;

  constructor(opts: { now: Date; seed: number }) {
    this.now = new Date(opts.now.getTime());
    this.nowIso = this.now.toISOString();
    this.rng = new Prng(opts.seed);
    this.ids = new SequentialIdGenerator("seed");
  }

  /** ISO timestamp `hours` hours before now (fractional allowed). */
  hoursAgo(hours: number): string {
    return new Date(this.now.getTime() - hours * HOUR_MS).toISOString();
  }

  /** ISO timestamp `days` days before now (fractional allowed). */
  daysAgo(days: number): string {
    return new Date(this.now.getTime() - days * DAY_MS).toISOString();
  }

  /** ISO timestamp `hours` hours after now. */
  hoursAhead(hours: number): string {
    return new Date(this.now.getTime() + hours * HOUR_MS).toISOString();
  }

  /** ISO timestamp for `days` days after now. */
  daysAhead(days: number): string {
    return new Date(this.now.getTime() + days * DAY_MS).toISOString();
  }

  /** ISO timestamp shifted by `ms` from another ISO timestamp. */
  shift(iso: string, ms: number): string {
    return new Date(new Date(iso).getTime() + ms).toISOString();
  }

  /**
   * A random timestamp in the past that falls inside a plausible trading
   * session for the asset class: 24h venues any time, listed venues during
   * US regular trading hours on weekdays.
   */
  tradingTime(assetClass: AssetClass, minDaysAgo: number, maxDaysAgo: number): string {
    const continuous = assetClass === "crypto" || assetClass === "forex" || assetClass === "future";
    for (let attempt = 0; attempt < 50; attempt++) {
      const daysBack = this.rng.range(minDaysAgo, maxDaysAgo);
      const t = new Date(this.now.getTime() - daysBack * DAY_MS);
      const dow = t.getUTCDay();
      if (continuous) {
        if (assetClass !== "crypto" && (dow === 6 || (dow === 0 && t.getUTCHours() < 22))) continue;
        t.setUTCSeconds(this.rng.int(0, 59), this.rng.int(0, 999));
        return t.toISOString();
      }
      if (dow === 0 || dow === 6) continue;
      // Regular trading hours: 13:30Z-20:00Z
      const minutesIntoSession = this.rng.int(0, 389);
      t.setUTCHours(13, 30 + minutesIntoSession, this.rng.int(0, 59), this.rng.int(0, 999));
      if (t.getTime() > this.now.getTime()) continue;
      return t.toISOString();
    }
    return this.daysAgo(maxDaysAgo);
  }
}

/** Round to `dp` decimal places, avoiding float noise like 0.30000000000000004. */
export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Round a price to the instrument tick size. */
export function roundToTick(price: number, tickSize: number): number {
  const dp = Math.max(0, Math.ceil(-Math.log10(tickSize)) + 1);
  return round(Math.round(price / tickSize) * tickSize, dp);
}

export function assertDefined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Seed generation error: ${what} is missing`);
  return value;
}
