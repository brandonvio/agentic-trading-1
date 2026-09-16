/**
 * Deterministic backtest simulator.
 *
 * Produces an equity curve and the usual performance statistics from a seeded
 * random walk whose drift and volatility are chosen per strategy style. This
 * is a mock: it models the *shape* of a plausible result so the UI, agents and
 * approval flows have realistic numbers to reason about, not a real engine.
 */
import type { PerformanceStats, StrategyStyle } from "@/lib/domain/strategy";

/** Annualised drift and volatility assumptions per style. */
const STYLE_PROFILE: Record<StrategyStyle, { drift: number; vol: number; winRate: number }> = {
  momentum: { drift: 0.18, vol: 0.16, winRate: 54 },
  mean_reversion: { drift: 0.12, vol: 0.1, winRate: 62 },
  volatility_arbitrage: { drift: 0.14, vol: 0.09, winRate: 66 },
  carry: { drift: 0.09, vol: 0.07, winRate: 71 },
  trend_following: { drift: 0.16, vol: 0.19, winRate: 42 },
  statistical_arbitrage: { drift: 0.13, vol: 0.08, winRate: 58 },
  event_probability: { drift: 0.22, vol: 0.24, winRate: 49 },
  market_making: { drift: 0.11, vol: 0.06, winRate: 78 },
  macro_discretionary: { drift: 0.15, vol: 0.14, winRate: 51 },
};

const TRADING_DAYS = 252;

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash so the same strategy + window always yields the same curve. */
export function hashSeed(...parts: string[]): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/** Box-Muller normal draw from two uniforms. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface BacktestSimInput {
  style: StrategyStyle;
  from: string;
  to: string;
  initialCapital: number;
  seed: number;
}

export interface BacktestSimResult {
  equityCurve: Array<[string, number]>;
  stats: PerformanceStats;
}

/**
 * Simulate weekly equity points between `from` and `to`. Returns at least two
 * points so downstream charts and drawdown maths always have a range.
 */
export function simulateBacktest({ style, from, to, initialCapital, seed }: BacktestSimInput): BacktestSimResult {
  const profile = STYLE_PROFILE[style];
  const rand = mulberry32(seed);
  const start = Date.parse(from);
  const end = Date.parse(to);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.max(2, Math.round((end - start) / weekMs));

  const weeklyDrift = profile.drift / 52;
  const weeklyVol = profile.vol / Math.sqrt(52);

  const equityCurve: Array<[string, number]> = [];
  const weeklyReturns: number[] = [];
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;

  equityCurve.push([new Date(start).toISOString(), Math.round(equity)]);
  for (let w = 1; w <= weeks; w++) {
    const r = weeklyDrift + weeklyVol * normal(rand);
    weeklyReturns.push(r);
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    equityCurve.push([new Date(start + w * weekMs).toISOString(), Math.round(equity)]);
  }

  const years = Math.max(weeks / 52, 1 / 52);
  const totalReturn = equity / initialCapital - 1;
  const annualized = Math.pow(1 + totalReturn, 1 / years) - 1;
  const mean = weeklyReturns.reduce((s, r) => s + r, 0) / weeklyReturns.length;
  const variance = weeklyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(weeklyReturns.length - 1, 1);
  const sd = Math.sqrt(variance);
  const downside = weeklyReturns.filter((r) => r < 0);
  const downsideSd = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / Math.max(downside.length, 1));

  const gains = weeklyReturns.filter((r) => r > 0).reduce((s, r) => s + r, 0);
  const losses = Math.abs(weeklyReturns.filter((r) => r < 0).reduce((s, r) => s + r, 0));
  const tradeCount = Math.round(weeks * (2 + rand() * 6));

  return {
    equityCurve,
    stats: {
      sharpe: sd > 0 ? round2((mean / sd) * Math.sqrt(52)) : 0,
      sortino: downsideSd > 0 ? round2((mean / downsideSd) * Math.sqrt(52)) : 0,
      annualizedReturnPct: round2(annualized * 100),
      maxDrawdownPct: round2(maxDrawdown * 100),
      winRatePct: round2(profile.winRate + (rand() - 0.5) * 6),
      profitFactor: losses > 0 ? round2(gains / losses) : round2(gains > 0 ? 3 : 0),
      tradeCount,
      asOf: new Date(end).toISOString(),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Trading days between two ISO dates, for reporting. */
export function tradingDaysBetween(from: string, to: string): number {
  const days = (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000);
  return Math.max(1, Math.round((days * TRADING_DAYS) / 365));
}
