/**
 * Reference price levels (approximate September 2026) used to anchor the
 * market simulator. Unknown symbols get a stable, hash-derived level so any
 * instrument the platform creates has a plausible price.
 */
import type { AssetClass } from "@/lib/domain/instrument";
import { hashString } from "./prng";

export interface ReferenceEntry {
  /** Anchor price (dollars, or probability for event contracts). */
  price: number;
  assetClass: AssetClass;
  /** Annualised volatility of the log price (logit for event contracts). */
  vol: number;
  /** Typical full-session volume (shares / contracts / units / coins). */
  dailyVolume: number;
}

type Row = [price: number, vol: number, dailyVolume: number];

const EQUITIES: Record<string, Row> = {
  SPY: [620, 0.15, 60_000_000],
  QQQ: [560, 0.2, 35_000_000],
  IWM: [235, 0.22, 30_000_000],
  DIA: [445, 0.14, 3_500_000],
  AAPL: [245, 0.26, 50_000_000],
  NVDA: [185, 0.45, 220_000_000],
  MSFT: [520, 0.24, 20_000_000],
  TSLA: [340, 0.55, 90_000_000],
  AMZN: [230, 0.3, 40_000_000],
  GOOGL: [200, 0.28, 25_000_000],
  META: [730, 0.34, 12_000_000],
  AMD: [165, 0.48, 40_000_000],
  JPM: [290, 0.22, 8_000_000],
  XLE: [92, 0.24, 15_000_000],
  GLD: [315, 0.14, 8_000_000],
  TLT: [88, 0.16, 30_000_000],
};

/** Futures are keyed by root symbol (ES, NQ, …), not by contract month. */
const FUTURES: Record<string, Row> = {
  ES: [6250, 0.16, 1_500_000],
  NQ: [22800, 0.22, 600_000],
  YM: [44800, 0.15, 150_000],
  RTY: [2360, 0.22, 250_000],
  CL: [68.5, 0.35, 700_000],
  GC: [3450, 0.15, 200_000],
  SI: [40.5, 0.28, 80_000],
  ZN: [111.5, 0.06, 1_200_000],
  ZB: [116, 0.1, 400_000],
  "6E": [1.092, 0.08, 200_000],
  "6J": [0.00667, 0.1, 150_000],
  NG: [3.2, 0.6, 300_000],
  HG: [4.6, 0.25, 80_000],
};

const FOREX: Record<string, Row> = {
  "EUR/USD": [1.092, 0.07, 300_000_000],
  "GBP/USD": [1.285, 0.08, 150_000_000],
  "USD/JPY": [150.2, 0.1, 200_000_000],
  "AUD/USD": [0.662, 0.09, 100_000_000],
  "USD/CHF": [0.876, 0.07, 80_000_000],
  "USD/CAD": [1.362, 0.06, 90_000_000],
  "NZD/USD": [0.605, 0.09, 40_000_000],
  "EUR/GBP": [0.85, 0.06, 60_000_000],
  "EUR/JPY": [164, 0.1, 70_000_000],
  "GBP/JPY": [193, 0.12, 50_000_000],
};

const CRYPTO: Record<string, Row> = {
  "BTC-USD": [105_000, 0.55, 25_000],
  "ETH-USD": [3900, 0.7, 350_000],
  "SOL-USD": [185, 0.9, 4_000_000],
  "XRP-USD": [2.4, 0.8, 900_000_000],
  "DOGE-USD": [0.19, 0.95, 2_500_000_000],
  "AVAX-USD": [32, 0.9, 6_000_000],
  "LINK-USD": [17.5, 0.85, 12_000_000],
};

/** Event contracts: price is the YES probability in dollars (0.01–0.99); vol is in logit space. */
const EVENTS: Record<string, Row> = {
  "FED-DEC26-CUT": [0.62, 1.6, 120_000],
  "FED-SEP26-HOLD": [0.78, 1.4, 90_000],
  "CPI-SEP26-ABOVE-3": [0.35, 1.8, 40_000],
  "SPX-EOY26-ABOVE-6500": [0.44, 1.5, 60_000],
  "BTC-EOY26-ABOVE-120K": [0.31, 1.9, 75_000],
  "RECESSION-2026": [0.18, 1.3, 50_000],
  "GOV-SHUTDOWN-OCT26": [0.27, 2.0, 30_000],
};

/** Implied volatility used to price options on each underlying. */
export const IMPLIED_VOL: Record<string, number> = {
  SPY: 0.16,
  QQQ: 0.2,
  IWM: 0.22,
  DIA: 0.14,
  AAPL: 0.26,
  NVDA: 0.45,
  MSFT: 0.24,
  TSLA: 0.55,
  AMZN: 0.3,
  GOOGL: 0.28,
  META: 0.34,
  AMD: 0.48,
};
export const DEFAULT_IMPLIED_VOL = 0.3;

/** Monthly carry applied to futures vs. the root's spot-equivalent price. */
export const FUTURES_MONTHLY_CARRY: Record<string, number> = {
  ES: 0.0035,
  NQ: 0.0035,
  YM: 0.0035,
  RTY: 0.003,
  CL: -0.004,
  GC: 0.0035,
  SI: 0.0035,
  ZN: -0.001,
  ZB: -0.001,
  "6E": 0.0015,
  "6J": 0.003,
  NG: 0.01,
  HG: 0.001,
};

const TABLES: Record<AssetClass, Record<string, Row>> = {
  equity: EQUITIES,
  option: {},
  future: FUTURES,
  forex: FOREX,
  crypto: CRYPTO,
  event: EVENTS,
};

const DEFAULT_VOL: Record<AssetClass, number> = {
  equity: 0.22,
  option: 0.3,
  future: 0.18,
  forex: 0.08,
  crypto: 0.65,
  event: 1.8,
};

const DEFAULT_VOLUME: Record<AssetClass, number> = {
  equity: 2_000_000,
  option: 5_000,
  future: 100_000,
  forex: 30_000_000,
  crypto: 100_000,
  event: 20_000,
};

/** Derives a stable, plausible price for a symbol that is not in the tables. */
function derivedPrice(symbol: string, assetClass: AssetClass): number {
  const u = (hashString(symbol) % 100_000) / 100_000; // uniform in [0, 1)
  switch (assetClass) {
    case "equity":
      return Math.round((10 + u * 490) * 100) / 100;
    case "future":
      return Math.round((50 + u * 4950) * 100) / 100;
    case "forex":
      return symbol.endsWith("JPY") ? Math.round((80 + u * 120) * 1000) / 1000 : Math.round((0.5 + u * 1.5) * 1e5) / 1e5;
    case "crypto":
      return Math.round(Math.exp(Math.log(0.01) + u * (Math.log(5000) - Math.log(0.01))) * 1e4) / 1e4;
    case "event":
      return Math.round((0.05 + u * 0.9) * 100) / 100;
    case "option":
      return Math.round((1 + u * 20) * 100) / 100;
  }
}

/** Looks up (or derives) the reference entry for a symbol in an asset class. */
export function referenceFor(symbol: string, assetClass: AssetClass): ReferenceEntry {
  const row = TABLES[assetClass][symbol];
  if (row) return { price: row[0], vol: row[1], dailyVolume: row[2], assetClass };
  return {
    price: derivedPrice(symbol, assetClass),
    vol: DEFAULT_VOL[assetClass],
    dailyVolume: DEFAULT_VOLUME[assetClass],
    assetClass,
  };
}

/** Asset class of a bare symbol when it appears in any table (used for `underlyingPrice`). */
export function knownAssetClassOf(symbol: string): AssetClass | null {
  for (const assetClass of Object.keys(TABLES) as AssetClass[]) {
    if (TABLES[assetClass][symbol]) return assetClass;
  }
  return null;
}

/** Implied volatility for an option underlying. */
export function impliedVolFor(underlyingSymbol: string): number {
  return IMPLIED_VOL[underlyingSymbol] ?? DEFAULT_IMPLIED_VOL;
}
