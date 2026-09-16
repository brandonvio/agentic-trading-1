/**
 * Instrument universe with September-2026 reference price levels. Levels are
 * aligned with the broker simulator anchors so seeded marks and mock quotes
 * agree. Option prices are hand-set to plausible mid-quotes for the tenor.
 */
import { ASSET_CLASS_BROKER, type Currency, type Instrument, type InstrumentDetails } from "@/lib/domain/instrument";
import { ID_PREFIX } from "@/lib/core/ids";
import type { InstrumentRef, SeedContext } from "../context";

/** Quote-currency → USD conversion used for base-currency market values. */
export const FX_TO_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 1.092,
  GBP: 1.285,
  JPY: 1 / 150.2,
  CHF: 1 / 0.876,
  AUD: 0.662,
  CAD: 1 / 1.362,
  NZD: 0.607,
  BTC: 105_000,
  ETH: 3_900,
  SOL: 210,
  USDC: 1,
};

interface Spec {
  symbol: string;
  name: string;
  venue: string;
  currency: Currency;
  multiplier: number;
  tickSize: number;
  lotSize: number;
  price: number;
  vol: number;
  dailyVolume: number;
  details: InstrumentDetails;
  tradable?: boolean;
}

const equity = (symbol: string, name: string, sector: string, price: number, vol: number, dailyVolume: number, exchange = "ARCA"): Spec => ({
  symbol,
  name,
  venue: exchange,
  currency: "USD",
  multiplier: 1,
  tickSize: 0.01,
  lotSize: 1,
  price,
  vol,
  dailyVolume,
  details: { assetClass: "equity", exchange, sector },
});

const optionSymbol = (underlying: string, expiry: string, right: "CALL" | "PUT", strike: number): string => {
  const yymmdd = expiry.slice(2).replaceAll("-", "");
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${underlying} ${yymmdd}${right === "CALL" ? "C" : "P"}${strikeStr}`;
};

const option = (underlying: string, expiry: string, right: "CALL" | "PUT", strike: number, price: number, vol: number): Spec => ({
  symbol: optionSymbol(underlying, expiry, right, strike),
  name: `${underlying} ${expiry} ${strike} ${right === "CALL" ? "Call" : "Put"}`,
  venue: "CBOE",
  currency: "USD",
  multiplier: 100,
  tickSize: 0.01,
  lotSize: 1,
  price,
  vol,
  dailyVolume: 15_000,
  details: { assetClass: "option", underlyingSymbol: underlying, strike, expiry, right, multiplier: 100 },
});

const future = (symbol: string, root: string, name: string, expiry: string, multiplier: number, tickSize: number, price: number, vol: number, dailyVolume: number, venue: string): Spec => ({
  symbol,
  name,
  venue,
  currency: "USD",
  multiplier,
  tickSize,
  lotSize: 1,
  price,
  vol,
  dailyVolume,
  details: { assetClass: "future", rootSymbol: root, expiry, multiplier, tickSize },
});

const forex = (base: Currency, quote: Currency, price: number, vol: number, dailyVolume: number): Spec => {
  const pipSize = quote === "JPY" ? 0.01 : 0.0001;
  return {
    symbol: `${base}/${quote}`,
    name: `${base}/${quote} Spot`,
    venue: "OANDA",
    currency: quote,
    multiplier: 1,
    tickSize: pipSize / 10,
    lotSize: 1000,
    price,
    vol,
    dailyVolume,
    details: { assetClass: "forex", baseCurrency: base, quoteCurrency: quote, pipSize },
  };
};

const crypto = (base: string, price: number, vol: number, dailyVolume: number, tickSize: number): Spec => ({
  symbol: `${base}-USD`,
  name: `${base} / US Dollar`,
  venue: "Coinbase Exchange",
  currency: "USD",
  multiplier: 1,
  tickSize,
  lotSize: 0.0001,
  price,
  vol,
  dailyVolume,
  details: { assetClass: "crypto", baseAsset: base, quoteAsset: "USD" },
});

const event = (symbol: string, name: string, question: string, closeTime: string, price: number, vol: number, dailyVolume: number): Spec => ({
  symbol,
  name,
  venue: "Kalshi",
  currency: "USD",
  multiplier: 1,
  tickSize: 0.01,
  lotSize: 1,
  price,
  vol,
  dailyVolume,
  details: { assetClass: "event", question, closeTime, settlementValue: 1 },
});

export const INSTRUMENT_SPECS: readonly Spec[] = [
  // --- Equities / ETFs -----------------------------------------------------
  equity("SPY", "SPDR S&P 500 ETF Trust", "Broad Market", 620, 0.15, 60_000_000),
  equity("QQQ", "Invesco QQQ Trust", "Technology", 560, 0.2, 35_000_000, "NASDAQ"),
  equity("IWM", "iShares Russell 2000 ETF", "Small Cap", 235, 0.22, 30_000_000),
  equity("DIA", "SPDR Dow Jones Industrial Average ETF", "Broad Market", 445, 0.14, 3_500_000),
  equity("AAPL", "Apple Inc.", "Technology", 245, 0.26, 50_000_000, "NASDAQ"),
  equity("NVDA", "NVIDIA Corporation", "Semiconductors", 185, 0.45, 220_000_000, "NASDAQ"),
  equity("MSFT", "Microsoft Corporation", "Technology", 520, 0.24, 20_000_000, "NASDAQ"),
  equity("TSLA", "Tesla, Inc.", "Automotive", 340, 0.55, 90_000_000, "NASDAQ"),
  equity("AMZN", "Amazon.com, Inc.", "Consumer Discretionary", 230, 0.3, 40_000_000, "NASDAQ"),
  equity("GOOGL", "Alphabet Inc. Class A", "Communication Services", 200, 0.28, 25_000_000, "NASDAQ"),
  equity("META", "Meta Platforms, Inc.", "Communication Services", 730, 0.34, 12_000_000, "NASDAQ"),
  equity("AMD", "Advanced Micro Devices, Inc.", "Semiconductors", 165, 0.48, 40_000_000, "NASDAQ"),
  equity("JPM", "JPMorgan Chase & Co.", "Financials", 290, 0.22, 8_000_000, "NYSE"),
  equity("XLE", "Energy Select Sector SPDR Fund", "Energy", 92, 0.24, 15_000_000),
  equity("GLD", "SPDR Gold Shares", "Commodities", 315, 0.14, 8_000_000),
  equity("TLT", "iShares 20+ Year Treasury Bond ETF", "Fixed Income", 88, 0.16, 30_000_000, "NASDAQ"),
  equity("XLF", "Financial Select Sector SPDR Fund", "Financials", 52, 0.18, 40_000_000),
  equity("HYG", "iShares iBoxx High Yield Corporate Bond ETF", "Fixed Income", 80, 0.08, 35_000_000),

  // --- Options (SPY / QQQ / NVDA / AAPL / TSLA) ------------------------------
  option("SPY", "2026-12-18", "PUT", 560, 6.1, 0.19),
  option("SPY", "2026-12-18", "PUT", 580, 9.4, 0.18),
  option("SPY", "2026-12-18", "PUT", 600, 14.2, 0.17),
  option("SPY", "2026-12-18", "PUT", 620, 21.3, 0.16),
  option("SPY", "2026-12-18", "CALL", 620, 24.8, 0.15),
  option("SPY", "2026-12-18", "CALL", 640, 14.6, 0.14),
  option("SPY", "2026-12-18", "CALL", 660, 7.9, 0.13),
  option("SPY", "2026-12-18", "CALL", 680, 3.7, 0.13),
  option("SPY", "2026-10-16", "PUT", 600, 8.2, 0.17),
  option("SPY", "2026-10-16", "CALL", 640, 6.4, 0.14),
  option("QQQ", "2026-12-18", "PUT", 500, 9.9, 0.24),
  option("QQQ", "2026-12-18", "PUT", 540, 17.8, 0.22),
  option("QQQ", "2026-12-18", "CALL", 580, 20.1, 0.2),
  option("QQQ", "2026-12-18", "CALL", 600, 12.6, 0.19),
  option("NVDA", "2026-10-16", "PUT", 170, 6.9, 0.46),
  option("NVDA", "2026-10-16", "PUT", 185, 11.4, 0.44),
  option("NVDA", "2026-10-16", "CALL", 185, 11.9, 0.44),
  option("NVDA", "2026-10-16", "CALL", 200, 5.6, 0.43),
  option("AAPL", "2026-11-20", "PUT", 230, 7.1, 0.27),
  option("AAPL", "2026-11-20", "CALL", 250, 9.8, 0.26),
  option("AAPL", "2026-11-20", "CALL", 260, 6.2, 0.26),
  option("TSLA", "2026-10-16", "PUT", 300, 13.2, 0.56),
  option("TSLA", "2026-10-16", "CALL", 340, 21.4, 0.55),
  option("TSLA", "2026-10-16", "CALL", 380, 9.1, 0.54),

  // --- Futures ---------------------------------------------------------------
  future("ESZ6", "ES", "E-mini S&P 500 Dec 2026", "2026-12-18", 50, 0.25, 6250, 0.16, 1_500_000, "CME"),
  future("NQZ6", "NQ", "E-mini Nasdaq-100 Dec 2026", "2026-12-18", 20, 0.25, 22800, 0.22, 600_000, "CME"),
  future("RTYZ6", "RTY", "E-mini Russell 2000 Dec 2026", "2026-12-18", 50, 0.1, 2360, 0.22, 250_000, "CME"),
  future("YMZ6", "YM", "E-mini Dow Dec 2026", "2026-12-18", 5, 1, 44800, 0.15, 150_000, "CBOT"),
  future("CLX6", "CL", "Crude Oil WTI Nov 2026", "2026-10-20", 1000, 0.01, 68.5, 0.35, 700_000, "NYMEX"),
  future("NGX6", "NG", "Henry Hub Natural Gas Nov 2026", "2026-10-28", 10000, 0.001, 3.2, 0.6, 300_000, "NYMEX"),
  future("GCZ6", "GC", "Gold Dec 2026", "2026-12-29", 100, 0.1, 3450, 0.15, 200_000, "COMEX"),
  future("SIZ6", "SI", "Silver Dec 2026", "2026-12-29", 5000, 0.005, 40.5, 0.28, 80_000, "COMEX"),
  future("HGZ6", "HG", "Copper Dec 2026", "2026-12-29", 25000, 0.0005, 4.6, 0.25, 80_000, "COMEX"),
  future("ZNZ6", "ZN", "10-Year T-Note Dec 2026", "2026-12-21", 1000, 0.015625, 111.5, 0.06, 1_200_000, "CBOT"),
  future("ZBZ6", "ZB", "30-Year T-Bond Dec 2026", "2026-12-21", 1000, 0.03125, 116, 0.1, 400_000, "CBOT"),
  future("6EZ6", "6E", "Euro FX Dec 2026", "2026-12-14", 125000, 0.00005, 1.092, 0.08, 200_000, "CME"),
  future("6JZ6", "6J", "Japanese Yen Dec 2026", "2026-12-14", 12500000, 0.0000005, 0.00667, 0.1, 150_000, "CME"),
  future("BTCZ6", "BTC", "CME Bitcoin Dec 2026", "2026-12-24", 5, 5, 106_900, 0.55, 12_000, "CME"),
  future("ETHZ6", "ETH", "CME Ether Dec 2026", "2026-12-24", 50, 0.5, 3_968, 0.7, 6_000, "CME"),

  // --- Forex ----------------------------------------------------------------
  forex("EUR", "USD", 1.092, 0.07, 300_000_000),
  forex("GBP", "USD", 1.285, 0.08, 150_000_000),
  forex("USD", "JPY", 150.2, 0.1, 200_000_000),
  forex("AUD", "USD", 0.662, 0.09, 100_000_000),
  forex("USD", "CHF", 0.876, 0.07, 80_000_000),
  forex("USD", "CAD", 1.362, 0.06, 90_000_000),
  forex("NZD", "USD", 0.605, 0.09, 40_000_000),
  forex("EUR", "GBP", 0.85, 0.06, 60_000_000),
  forex("EUR", "JPY", 164, 0.1, 70_000_000),
  forex("GBP", "JPY", 193, 0.12, 50_000_000),

  // --- Crypto ---------------------------------------------------------------
  crypto("BTC", 105_000, 0.55, 25_000, 0.01),
  crypto("ETH", 3_900, 0.7, 350_000, 0.01),
  crypto("SOL", 185, 0.9, 4_000_000, 0.01),
  crypto("XRP", 2.4, 0.8, 900_000_000, 0.0001),
  crypto("DOGE", 0.19, 0.95, 2_500_000_000, 0.00001),
  crypto("AVAX", 32, 0.9, 6_000_000, 0.01),
  crypto("LINK", 17.5, 0.85, 12_000_000, 0.001),
  crypto("ADA", 0.78, 0.85, 600_000_000, 0.0001),
  crypto("DOT", 4.1, 0.9, 20_000_000, 0.001),
  crypto("LTC", 98, 0.75, 1_500_000, 0.01),

  // --- Kalshi event contracts ------------------------------------------------
  event("FED-DEC26-CUT", "Fed cuts rates at December 2026 FOMC", "Will the Federal Reserve lower the target federal funds rate at its December 2026 meeting?", "2026-12-16T19:00:00.000Z", 0.62, 0.9, 1_200_000),
  event("FED-SEP26-HOLD", "Fed holds at September 2026 FOMC", "Will the Federal Reserve leave the target federal funds rate unchanged at its September 16-17, 2026 meeting?", "2026-09-17T18:00:00.000Z", 0.71, 1.1, 2_400_000),
  event("FED-NOV26-CUT", "Fed cuts rates at November 2026 FOMC", "Will the Federal Reserve lower the target federal funds rate at its November 2026 meeting?", "2026-11-04T19:00:00.000Z", 0.38, 1.0, 900_000),
  event("CPI-SEP26-ABOVE3", "September 2026 CPI YoY above 3.0%", "Will headline CPI for September 2026 (released in October) print at or above 3.0% year-over-year?", "2026-10-14T12:30:00.000Z", 0.31, 1.0, 650_000),
  event("SPX-YE26-6500", "S&P 500 closes 2026 above 6,500", "Will the S&P 500 index close above 6,500 on December 31, 2026?", "2026-12-31T21:00:00.000Z", 0.47, 0.8, 800_000),
  event("USREC-2026", "US recession declared for 2026", "Will the NBER declare that a US recession began at any point in calendar year 2026?", "2027-06-30T23:59:00.000Z", 0.14, 0.7, 300_000),
  event("BTC-120K-2026", "Bitcoin trades above $120,000 in 2026", "Will Bitcoin (BTC/USD on Coinbase) trade at or above $120,000 at any point before December 31, 2026?", "2026-12-31T23:59:00.000Z", 0.44, 0.9, 550_000),
  event("UNEMP-OCT26-ABOVE45", "US unemployment above 4.5% in October 2026", "Will the US unemployment rate for October 2026 (released in November) be reported at or above 4.5%?", "2026-11-06T12:30:00.000Z", 0.36, 1.0, 400_000),
  event("GDP-Q3-26-ABOVE2", "US Q3 2026 GDP growth above 2.0%", "Will the advance estimate of US real GDP growth for Q3 2026 be at or above 2.0% annualised?", "2026-10-29T12:30:00.000Z", 0.55, 0.9, 350_000),
  event("ECB-OCT26-CUT", "ECB cuts deposit rate in October 2026", "Will the European Central Bank lower its deposit facility rate at its October 2026 meeting?", "2026-10-29T12:45:00.000Z", 0.27, 1.0, 200_000),
];

export interface InstrumentBundle {
  instruments: Instrument[];
  /** Keyed by canonical symbol. */
  refs: Map<string, InstrumentRef>;
}

export function generateInstruments(ctx: SeedContext): InstrumentBundle {
  const createdAt = ctx.daysAgo(180);
  const updatedAt = ctx.daysAgo(1);
  const instruments: Instrument[] = [];
  const refs = new Map<string, InstrumentRef>();
  for (const spec of INSTRUMENT_SPECS) {
    const assetClass = spec.details.assetClass;
    const instrument: Instrument = {
      id: ctx.ids.next(ID_PREFIX.instrument),
      symbol: spec.symbol,
      name: spec.name,
      assetClass,
      broker: ASSET_CLASS_BROKER[assetClass],
      venue: spec.venue,
      currency: spec.currency,
      multiplier: spec.multiplier,
      tickSize: spec.tickSize,
      lotSize: spec.lotSize,
      tradable: spec.tradable ?? true,
      details: spec.details,
      createdAt,
      updatedAt,
    };
    instruments.push(instrument);
    refs.set(spec.symbol, { instrument, price: spec.price, vol: spec.vol, dailyVolume: spec.dailyVolume });
  }
  return { instruments, refs };
}
