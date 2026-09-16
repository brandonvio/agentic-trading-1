/**
 * Heuristics behind MarketDataService.getMarketOverview. Pure functions so
 * they can be unit-tested without brokers.
 */
import type { Instrument } from "@/lib/domain/instrument";
import type { MarketOverview } from "@/lib/services/interfaces";

export type BenchmarkSpec = { name: string; unit: string } & ({ kind: "symbol"; symbol: string } | { kind: "future"; root: string });

export const BENCHMARKS: BenchmarkSpec[] = [
  { kind: "symbol", symbol: "SPY", name: "S&P 500 (SPY)", unit: "USD" },
  { kind: "symbol", symbol: "QQQ", name: "Nasdaq 100 (QQQ)", unit: "USD" },
  { kind: "future", root: "ES", name: "E-mini S&P front", unit: "pts" },
  { kind: "symbol", symbol: "EUR/USD", name: "EUR/USD", unit: "rate" },
  { kind: "symbol", symbol: "USD/JPY", name: "USD/JPY", unit: "rate" },
  { kind: "symbol", symbol: "BTC-USD", name: "Bitcoin", unit: "USD" },
  { kind: "future", root: "GC", name: "Gold front", unit: "USD/oz" },
  { kind: "future", root: "CL", name: "WTI crude front", unit: "USD/bbl" },
];

/** The nearest-expiry future for a root symbol that has not yet expired. */
export function frontMonthFuture(candidates: Instrument[], root: string, now: Date): Instrument | null {
  const today = now.toISOString().slice(0, 10);
  const live = candidates
    .filter((i) => i.details.assetClass === "future" && i.details.rootSymbol === root && i.details.expiry >= today)
    .sort((a, b) => (a.details.assetClass === "future" && b.details.assetClass === "future" ? a.details.expiry.localeCompare(b.details.expiry) : 0));
  return live[0] ?? null;
}

/**
 * Regime heuristic on session moves:
 *  - dispersion (stdev of changePct) above 3% → volatile
 *  - average above +0.3% → risk_on, below −0.3% → risk_off, else neutral
 */
export function classifyRegime(changes: number[]): MarketOverview["regime"] {
  if (changes.length === 0) return "neutral";
  const avg = changes.reduce((s, c) => s + c, 0) / changes.length;
  const variance = changes.reduce((s, c) => s + (c - avg) ** 2, 0) / changes.length;
  const dispersion = Math.sqrt(variance);
  if (dispersion > 0.03) return "volatile";
  if (avg > 0.003) return "risk_on";
  if (avg < -0.003) return "risk_off";
  return "neutral";
}

export function headlineFor(regime: MarketOverview["regime"], indicators: MarketOverview["indicators"], movers: MarketOverview["movers"]): string {
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
  const spy = indicators.find((i) => i.name.includes("SPY"));
  const lead = spy ? `SPY ${pct(spy.changePct)}` : indicators[0] ? `${indicators[0].name} ${pct(indicators[0].changePct)}` : "No benchmark data";
  const top = movers[0] ? `; top mover ${movers[0].symbol} ${pct(movers[0].changePct)}` : "";
  const label: Record<MarketOverview["regime"], string> = {
    risk_on: "Risk-on tape",
    risk_off: "Risk-off tape",
    neutral: "Mixed, range-bound session",
    volatile: "Volatile, high-dispersion session",
  };
  return `${label[regime]}: ${lead}${top}`;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

function at(d: Date, hour: number, minute = 0): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute)).toISOString();
}

/**
 * Static-but-dated macro calendar relative to `now`: next NFP (first Friday),
 * CPI (~the 12th), FOMC (~every 6 weeks anchored to the third Wednesday of
 * the next FOMC month) and monthly opex (third Friday). Sorted by time.
 */
export function buildEventCalendar(now: Date): MarketOverview["eventCalendar"] {
  const events: MarketOverview["eventCalendar"] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (const delta of [0, 1]) {
    const month = new Date(Date.UTC(y, m + delta, 1));
    const yy = month.getUTCFullYear();
    const mm = month.getUTCMonth();
    events.push({ time: at(nthWeekdayOfMonth(yy, mm, 5, 1), 12, 30), event: "US Non-farm payrolls", importance: "high" });
    events.push({ time: at(new Date(Date.UTC(yy, mm, 12)), 12, 30), event: "US CPI", importance: "high" });
    events.push({ time: at(nthWeekdayOfMonth(yy, mm, 5, 3), 20, 0), event: "Monthly options expiration", importance: "medium" });
    // FOMC meets in Jan, Mar, May, Jun, Jul, Sep, Nov, Dec.
    if ([0, 2, 4, 5, 6, 8, 10, 11].includes(mm)) {
      events.push({ time: at(nthWeekdayOfMonth(yy, mm, 3, 3), 18, 0), event: "FOMC rate decision", importance: "high" });
    }
    events.push({ time: at(nthWeekdayOfMonth(yy, mm, 4, 1), 12, 30), event: "Weekly jobless claims", importance: "low" });
  }
  return events
    .filter((e) => e.time >= now.toISOString())
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 8);
}
