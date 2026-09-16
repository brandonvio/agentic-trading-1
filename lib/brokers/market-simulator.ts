/**
 * Deterministic market-data simulator.
 *
 * Price model (per underlying path):
 *   state(t) = anchor + dayWalk(day) + intradayBridge(day, minute)
 * where `anchor` is ln(reference price) (logit for event contracts), `dayWalk`
 * is a seeded random walk over UTC days from 2026-09-01, and the intraday
 * component is a Brownian bridge over the day's 1440 minutes (so each day's
 * close equals its day-level value and the next day opens with a gap). The
 * state is constant within a minute bucket and drifts across minutes; every
 * random draw is seeded by (seed, symbol, day|bucket) so any (instrument, time)
 * pair always yields the same price regardless of call order.
 *
 * Derived instruments: options are Black–Scholes on the simulated underlying,
 * futures apply monthly carry to the root's path, event contracts are the
 * sigmoid of a logit-space path clamped to 0.01–0.99.
 */
import type { Clock } from "@/lib/core/clock";
import type { AssetClass, Bar, BarInterval, Instrument, Quote } from "@/lib/domain/instrument";
import { blackScholes } from "./black-scholes";
import { clamp, roundToTick } from "./pricing";
import { SeededRandom, combineSeeds, hashString } from "./prng";
import { FUTURES_MONTHLY_CARRY, impliedVolFor, knownAssetClassOf, referenceFor, type ReferenceEntry } from "./reference-prices";

export interface MarketSimulatorOptions {
  clock: Clock;
  /** Master seed; default 42. */
  seed?: number;
}

export const BAR_INTERVAL_MINUTES: Record<BarInterval, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "1d": 1440 };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;
const ANCHOR_DAY = Math.floor(Date.UTC(2026, 8, 1) / DAY_MS);
const TRADING_DAYS = 252;
const DAY_SHARE = 0.7;
const INTRADAY_SHARE = 0.7;
const RISK_FREE_RATE = 0.04;
const YEAR_MS = 365.25 * DAY_MS;
const MONTH_MS = 30.44 * DAY_MS;
const MAX_BRIDGE_CACHE = 4096;
const EVENT_MIN = 0.01;
const EVENT_MAX = 0.99;

/** Identifies one simulated price path (symbol + the class its reference lives in). */
interface PathKey {
  key: string;
  ref: ReferenceEntry;
}

interface DayWalk {
  forward: number[];
  backward: number[];
  forwardRng: SeededRandom;
  backwardRng: SeededRandom;
}

function logit(p: number): number {
  return Math.log(p / (1 - p));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function bucketOf(at: Date): number {
  return Math.floor(at.getTime() / MINUTE_MS);
}
function parseExpiry(expiry: string): number {
  const [y, m, d] = expiry.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 20, 0, 0); // 16:00 ET ≈ 20:00 UTC
}

/** Seeded, clock-driven price/quote/bar generator for every asset class. */
export class MarketSimulator {
  readonly seed: number;
  private readonly clock: Clock;
  private readonly dayWalks = new Map<string, DayWalk>();
  private readonly bridges = new Map<string, Float64Array>();

  constructor(opts: MarketSimulatorOptions) {
    this.clock = opts.clock;
    this.seed = opts.seed ?? 42;
  }

  /** Current simulator time (from the injected clock). */
  now(): Date {
    return this.clock.now();
  }

  /** Mid price of an instrument at `at`, rounded to its tick. */
  price(instrument: Instrument, at: Date = this.clock.now()): number {
    return this.roundPrice(instrument, this.priceAtBucket(instrument, bucketOf(at)));
  }

  /** Simulated spot price for a bare symbol (equity unless the symbol is known in another table). */
  underlyingPrice(symbol: string, at: Date = this.clock.now()): number {
    return this.underlyingSpot(symbol, bucketOf(at));
  }

  /** Snapshot quote with class-appropriate spread, sizes, volume and day change. */
  quote(instrument: Instrument, at: Date = this.clock.now()): Quote {
    const bucket = bucketOf(at);
    const tick = instrument.tickSize;
    const rng = new SeededRandom(combineSeeds(this.seed, hashString(instrument.symbol), bucket, 0x51));
    const rawMid = this.priceAtBucket(instrument, bucket);
    const spread = this.spreadFor(instrument, rawMid);
    let bid = this.roundPrice(instrument, rawMid - spread / 2);
    let ask = this.roundPrice(instrument, rawMid + spread / 2);
    if (ask <= bid) ask = roundToTick(bid + tick, tick);
    if (instrument.assetClass === "event") {
      if (ask > EVENT_MAX) {
        ask = EVENT_MAX;
        bid = Math.min(bid, roundToTick(EVENT_MAX - tick, tick));
      }
      if (bid < EVENT_MIN) {
        bid = EVENT_MIN;
        ask = Math.max(ask, roundToTick(EVENT_MIN + tick, tick));
      }
    }
    const mid = (bid + ask) / 2;
    const last = clamp(this.roundPrice(instrument, mid + rng.range(-0.5, 0.5) * (ask - bid)), bid, ask);
    const { bidSize, askSize } = this.sizesFor(instrument.assetClass, rng);
    const ref = this.pathKey(instrument.symbol, instrument.assetClass).ref;
    const minuteOfDay = bucket - Math.floor(bucket / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    const volume = Math.floor((ref.dailyVolume * (minuteOfDay + 1) * rng.range(0.8, 1.2)) / MINUTES_PER_DAY);
    const priorClose = this.priceAtBucket(instrument, Math.floor(bucket / MINUTES_PER_DAY) * MINUTES_PER_DAY - 1);
    const changePct = priorClose > 0 ? mid / priorClose - 1 : 0;
    const impliedVol = instrument.details.assetClass === "option" ? this.optionVol(instrument, this.underlyingSpot(instrument.details.underlyingSymbol, bucket)) : null;
    return {
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      bid,
      ask,
      last,
      mid,
      bidSize,
      askSize,
      volume,
      changePct,
      impliedVol,
      asOf: at.toISOString(),
    };
  }

  /**
   * Historical bars ending at (and including the bar containing) `end`,
   * ascending, aligned to interval boundaries in UTC. The final bar may be a
   * still-forming bar whose close is the price as of `end`.
   */
  bars(instrument: Instrument, interval: BarInterval, count: number, end: Date = this.clock.now()): Bar[] {
    const n = BAR_INTERVAL_MINUTES[interval];
    const endBucket = bucketOf(end);
    const lastStart = Math.floor(endBucket / n) * n;
    const ref = this.pathKey(instrument.symbol, instrument.assetClass).ref;
    const minuteSd = (ref.vol / Math.sqrt(TRADING_DAYS)) * INTRADAY_SHARE * Math.sqrt(1 / MINUTES_PER_DAY);
    const out: Bar[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const start = lastStart - i * n;
      const closeBucket = Math.min(start + n - 1, endBucket);
      const open = this.priceAtBucket(instrument, start - 1);
      let high = open;
      let low = open;
      let close = open;
      for (let b = start; b <= closeBucket; b++) {
        close = this.priceAtBucket(instrument, b);
        if (close > high) high = close;
        if (close < low) low = close;
      }
      const rng = new SeededRandom(combineSeeds(this.seed, hashString(instrument.symbol), start, n));
      if (instrument.assetClass === "event") {
        high = Math.min(EVENT_MAX, high + (rng.chance(0.3) ? instrument.tickSize : 0));
        low = Math.max(EVENT_MIN, low - (rng.chance(0.3) ? instrument.tickSize : 0));
      } else {
        high *= 1 + Math.abs(rng.normal(0, minuteSd)) * Math.sqrt(n) * 0.5;
        low *= 1 - Math.abs(rng.normal(0, minuteSd)) * Math.sqrt(n) * 0.5;
      }
      const o = this.roundPrice(instrument, open);
      const c = this.roundPrice(instrument, close);
      const h = Math.max(this.roundPrice(instrument, high), o, c);
      const l = Math.min(this.roundPrice(instrument, low), o, c);
      const volume = Math.floor((ref.dailyVolume * (closeBucket - start + 1) * rng.range(0.4, 1.6)) / MINUTES_PER_DAY);
      out.push({ instrumentId: instrument.id, time: new Date(start * MINUTE_MS).toISOString(), open: o, high: h, low: l, close: c, volume });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Price derivation

  private roundPrice(instrument: Instrument, raw: number): number {
    const tick = instrument.tickSize;
    if (instrument.assetClass === "event") return clamp(roundToTick(raw, tick), EVENT_MIN, EVENT_MAX);
    return Math.max(tick, roundToTick(raw, tick));
  }

  /** Unrounded price of an instrument for a minute bucket. */
  private priceAtBucket(instrument: Instrument, bucket: number): number {
    const details = instrument.details;
    switch (details.assetClass) {
      case "option": {
        const spot = this.underlyingSpot(details.underlyingSymbol, bucket);
        const years = (parseExpiry(details.expiry) - bucket * MINUTE_MS) / YEAR_MS;
        return blackScholes({
          spot,
          strike: details.strike,
          years: years <= 0 ? 0 : Math.max(years, 1 / (365.25 * 24)),
          vol: this.optionVol(instrument, spot),
          rate: RISK_FREE_RATE,
          right: details.right,
        });
      }
      case "future": {
        const root = this.rawPrice(this.pathKey(details.rootSymbol, "future"), bucket);
        const months = Math.max(0, (parseExpiry(details.expiry) - bucket * MINUTE_MS) / MONTH_MS);
        return root * (1 + (FUTURES_MONTHLY_CARRY[details.rootSymbol] ?? 0) * months);
      }
      default:
        return this.rawPrice(this.pathKey(instrument.symbol, instrument.assetClass), bucket);
    }
  }

  private underlyingSpot(symbol: string, bucket: number): number {
    return this.rawPrice(this.pathKey(symbol, knownAssetClassOf(symbol) ?? "equity"), bucket);
  }

  /** Implied vol with a mild strike skew (lower vol for higher strikes). */
  private optionVol(instrument: Instrument, spot: number): number {
    const details = instrument.details;
    if (details.assetClass !== "option") return 0;
    const base = impliedVolFor(details.underlyingSymbol);
    const skew = 1 - 0.2 * Math.log(details.strike / Math.max(spot, 1e-9));
    return clamp(base * skew, base * 0.5, base * 2);
  }

  private pathKey(symbol: string, assetClass: AssetClass): PathKey {
    return { key: `${assetClass}:${symbol}`, ref: referenceFor(symbol, assetClass) };
  }

  private rawPrice(path: PathKey, bucket: number): number {
    const state = this.stateAt(path, bucket);
    if (path.ref.assetClass === "event") return clamp(sigmoid(state), EVENT_MIN, EVENT_MAX);
    return Math.exp(state);
  }

  private stateAt(path: PathKey, bucket: number): number {
    const dayIdx = Math.floor(bucket / MINUTES_PER_DAY);
    const minute = bucket - dayIdx * MINUTES_PER_DAY;
    const anchor = path.ref.assetClass === "event" ? logit(path.ref.price) : Math.log(path.ref.price);
    return anchor + this.dayLevel(path, dayIdx) + this.bridge(path, dayIdx)[minute + 1];
  }

  private dailySd(ref: ReferenceEntry): number {
    return ref.vol / Math.sqrt(TRADING_DAYS);
  }

  /** Cumulative day-level log return relative to the anchor day. */
  private dayLevel(path: PathKey, dayIdx: number): number {
    let walk = this.dayWalks.get(path.key);
    if (!walk) {
      const base = combineSeeds(this.seed, hashString(path.key));
      walk = {
        forward: [0],
        backward: [0],
        forwardRng: new SeededRandom(combineSeeds(base, 1)),
        backwardRng: new SeededRandom(combineSeeds(base, 2)),
      };
      this.dayWalks.set(path.key, walk);
    }
    const sd = this.dailySd(path.ref) * DAY_SHARE;
    const offset = dayIdx - ANCHOR_DAY;
    const arr = offset >= 0 ? walk.forward : walk.backward;
    const rng = offset >= 0 ? walk.forwardRng : walk.backwardRng;
    const idx = Math.abs(offset);
    while (arr.length <= idx) arr.push(arr[arr.length - 1] + rng.normal(0, sd));
    return arr[idx];
  }

  /** Brownian bridge over one UTC day: 1441 points, zero at both ends. */
  private bridge(path: PathKey, dayIdx: number): Float64Array {
    const cacheKey = `${path.key}|${dayIdx}`;
    const cached = this.bridges.get(cacheKey);
    if (cached) return cached;
    const rng = new SeededRandom(combineSeeds(this.seed, hashString(path.key), dayIdx, 0xb1));
    const sd = this.dailySd(path.ref) * INTRADAY_SHARE * Math.sqrt(1 / MINUTES_PER_DAY);
    const walk = new Float64Array(MINUTES_PER_DAY + 1);
    for (let i = 1; i <= MINUTES_PER_DAY; i++) walk[i] = walk[i - 1] + rng.normal(0, sd);
    const terminal = walk[MINUTES_PER_DAY];
    for (let i = 1; i <= MINUTES_PER_DAY; i++) walk[i] -= (i / MINUTES_PER_DAY) * terminal;
    if (this.bridges.size >= MAX_BRIDGE_CACHE) {
      const oldest = this.bridges.keys().next().value;
      if (oldest !== undefined) this.bridges.delete(oldest);
    }
    this.bridges.set(cacheKey, walk);
    return walk;
  }

  // ---------------------------------------------------------------------------
  // Quote microstructure

  private spreadFor(instrument: Instrument, mid: number): number {
    const tick = instrument.tickSize;
    const details = instrument.details;
    switch (details.assetClass) {
      case "equity":
        return Math.max(tick, mid * 0.00015);
      case "option":
        return Math.max(tick, mid * 0.03);
      case "future":
        return Math.max(tick, details.tickSize);
      case "forex":
        return Math.max(tick, details.pipSize * 0.8);
      case "crypto":
        return Math.max(tick, mid * 0.0005);
      case "event":
        return Math.max(tick, 0.02);
    }
  }

  private sizesFor(assetClass: AssetClass, rng: SeededRandom): { bidSize: number; askSize: number } {
    switch (assetClass) {
      case "equity":
        return { bidSize: rng.int(1, 50) * 100, askSize: rng.int(1, 50) * 100 };
      case "option":
        return { bidSize: rng.int(1, 200), askSize: rng.int(1, 200) };
      case "future":
        return { bidSize: rng.int(1, 150), askSize: rng.int(1, 150) };
      case "forex":
        return { bidSize: rng.int(1, 50) * 100_000, askSize: rng.int(1, 50) * 100_000 };
      case "crypto":
        return { bidSize: Math.round(rng.range(0.1, 25) * 1e4) / 1e4, askSize: Math.round(rng.range(0.1, 25) * 1e4) / 1e4 };
      case "event":
        return { bidSize: rng.int(1, 2000), askSize: rng.int(1, 2000) };
    }
  }
}
