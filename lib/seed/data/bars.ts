/**
 * OHLCV history for the instruments the UI charts: 120 calendar days of daily
 * bars and five days of hourly bars.
 *
 * Each series is a seeded random walk that is re-anchored so the final close
 * equals the instrument's reference price, which keeps charts, quotes and
 * position marks telling the same story.
 */
import type { AssetClass, Bar } from "@/lib/domain/instrument";
import { DAY_MS, HOUR_MS, round, roundToTick, type InstrumentRef, type SeedContext } from "../context";
import type { InstrumentBundle } from "./instruments";

/** Instruments that get a bar history. Everything else is quote-only. */
export const CHARTED_SYMBOLS: readonly string[] = [
  "SPY", "QQQ", "IWM", "AAPL", "NVDA", "MSFT", "TSLA", "META", "TLT", "GLD",
  "ESZ6", "NQZ6", "CLX6", "GCZ6", "ZNZ6",
  "EUR/USD", "USD/JPY", "GBP/USD", "AUD/USD",
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD",
  "FED-DEC26-CUT", "SPX-YE26-6500",
];

export const DAILY_BAR_DAYS = 120;
export const HOURLY_BAR_DAYS = 5;

export interface BarBundle {
  daily: Bar[];
  hourly: Bar[];
}

function isWeekend(t: Date): boolean {
  const d = t.getUTCDay();
  return d === 0 || d === 6;
}

/** Daily session opens (midnight UTC) for the asset class, oldest first. */
function dailyTimestamps(now: Date, assetClass: AssetClass): number[] {
  const lastMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: number[] = [];
  for (let i = DAILY_BAR_DAYS - 1; i >= 0; i--) {
    const t = lastMidnight - i * DAY_MS;
    if (assetClass !== "crypto" && isWeekend(new Date(t))) continue;
    out.push(t);
  }
  return out;
}

/** Hourly bar opens for the asset class over the last `HOURLY_BAR_DAYS` days. */
function hourlyTimestamps(now: Date, assetClass: AssetClass): number[] {
  const lastHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const first = lastHour - HOURLY_BAR_DAYS * 24 * HOUR_MS;
  const continuous = assetClass === "crypto" || assetClass === "forex" || assetClass === "future";
  const out: number[] = [];
  for (let t = first; t <= lastHour; t += HOUR_MS) {
    const d = new Date(t);
    if (assetClass !== "crypto" && isWeekend(d)) continue;
    if (!continuous) {
      const h = d.getUTCHours();
      if (h < 14 || h > 20) continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * Closes for `count` bars ending exactly at `ref.price`.
 * Event contracts walk additively in probability space; everything else walks
 * multiplicatively in log space.
 */
function anchoredCloses(ctx: SeedContext, ref: InstrumentRef, count: number, stepYears: number): number[] {
  const sigma = ref.vol * Math.sqrt(stepYears);
  const cumulative: number[] = [0];
  for (let i = 1; i <= count; i++) cumulative.push(cumulative[i - 1] + ctx.rng.normal(0, sigma));
  const last = cumulative[count];
  if (ref.instrument.assetClass === "event") {
    const scale = 0.35;
    return cumulative.slice(1).map((c) => Math.min(0.97, Math.max(0.03, ref.price + (c - last) * scale)));
  }
  return cumulative.slice(1).map((c) => ref.price * Math.exp(c - last));
}

function buildSeries(ctx: SeedContext, ref: InstrumentRef, times: number[], stepYears: number, volumeShare: number): Bar[] {
  if (times.length === 0) return [];
  const closes = anchoredCloses(ctx, ref, times.length, stepYears);
  const tick = ref.instrument.tickSize;
  const firstOpen = closes[0] * (1 - ctx.rng.normal(0, 0.2) * ref.vol * Math.sqrt(stepYears));
  const bars: Bar[] = [];
  for (let i = 0; i < times.length; i++) {
    const close = closes[i];
    const rawOpen = i === 0 ? firstOpen : closes[i - 1];
    const open = roundToTick(rawOpen, tick);
    const closeR = roundToTick(close, tick);
    const wick = Math.abs(close) * ref.vol * Math.sqrt(stepYears) * 0.6;
    const high = roundToTick(Math.max(open, closeR) + Math.abs(ctx.rng.normal(0, wick)), tick);
    const low = roundToTick(Math.min(open, closeR) - Math.abs(ctx.rng.normal(0, wick)), tick);
    bars.push({
      instrumentId: ref.instrument.id,
      time: new Date(times[i]).toISOString(),
      open,
      high: Math.max(high, open, closeR),
      low: Math.max(tick, Math.min(low, open, closeR)),
      close: closeR,
      volume: round(ref.dailyVolume * volumeShare * Math.exp(ctx.rng.normal(0, 0.35)), 0),
    });
  }
  return bars;
}

export function generateBars(ctx: SeedContext, instruments: InstrumentBundle): BarBundle {
  const daily: Bar[] = [];
  const hourly: Bar[] = [];
  for (const symbol of CHARTED_SYMBOLS) {
    const ref = instruments.refs.get(symbol);
    if (!ref) throw new Error(`Seed generation error: charted symbol ${symbol} is not in the instrument universe`);
    const assetClass = ref.instrument.assetClass;
    const dailyTimes = dailyTimestamps(ctx.now, assetClass);
    const hourlyTimes = hourlyTimestamps(ctx.now, assetClass);
    daily.push(...buildSeries(ctx, ref, dailyTimes, 1 / 252, 1));
    const sessionsPerDay = assetClass === "crypto" ? 24 : assetClass === "equity" || assetClass === "event" ? 7 : 24;
    hourly.push(...buildSeries(ctx, ref, hourlyTimes, 1 / (252 * sessionsPerDay), 1 / sessionsPerDay));
  }
  return { daily, hourly };
}
