import { z } from "zod";
import { Currency, Timestamped } from "./common";

export { Currency };

export const BrokerKey = z.enum(["ibkr", "oanda", "tradovate", "coinbase", "kalshi"]);
export type BrokerKey = z.infer<typeof BrokerKey>;

export const AssetClass = z.enum(["equity", "option", "future", "forex", "crypto", "event"]);
export type AssetClass = z.infer<typeof AssetClass>;

/** Which broker is the system of record for each asset class. */
export const ASSET_CLASS_BROKER: Record<AssetClass, BrokerKey> = {
  equity: "ibkr",
  option: "ibkr",
  future: "tradovate",
  forex: "oanda",
  crypto: "coinbase",
  event: "kalshi",
};

export const OptionRight = z.enum(["CALL", "PUT"]);
export type OptionRight = z.infer<typeof OptionRight>;

/** Asset-class specific attributes stored alongside an instrument. */
export const OptionDetails = z.object({
  underlyingSymbol: z.string(),
  strike: z.number().positive(),
  expiry: z.string(), // YYYY-MM-DD
  right: OptionRight,
  multiplier: z.number().positive().default(100),
});

export const FutureDetails = z.object({
  rootSymbol: z.string(),
  expiry: z.string(), // YYYY-MM-DD
  multiplier: z.number().positive(),
  tickSize: z.number().positive(),
});

export const ForexDetails = z.object({
  baseCurrency: Currency,
  quoteCurrency: Currency,
  pipSize: z.number().positive(),
});

export const CryptoDetails = z.object({
  baseAsset: z.string(),
  quoteAsset: z.string(),
});

export const EventDetails = z.object({
  /** Kalshi market question, e.g. "Will the Fed cut rates in December 2026?" */
  question: z.string(),
  closeTime: z.string(),
  /** Contract settles to 1.00 if YES, 0.00 if NO. */
  settlementValue: z.number().default(1),
});

export const EquityDetails = z.object({
  exchange: z.string(),
  sector: z.string().optional(),
});

export const InstrumentDetails = z.discriminatedUnion("assetClass", [
  z.object({ assetClass: z.literal("option") }).merge(OptionDetails),
  z.object({ assetClass: z.literal("future") }).merge(FutureDetails),
  z.object({ assetClass: z.literal("forex") }).merge(ForexDetails),
  z.object({ assetClass: z.literal("crypto") }).merge(CryptoDetails),
  z.object({ assetClass: z.literal("event") }).merge(EventDetails),
  z.object({ assetClass: z.literal("equity") }).merge(EquityDetails),
]);
export type InstrumentDetails = z.infer<typeof InstrumentDetails>;

export const Instrument = Timestamped.extend({
  id: z.string(),
  /** Platform-wide canonical symbol (e.g. `SPY 260918C00560000`, `EUR/USD`, `ESZ6`, `BTC-USD`, `FED-DEC26-CUT`). */
  symbol: z.string(),
  name: z.string(),
  assetClass: AssetClass,
  broker: BrokerKey,
  venue: z.string(),
  currency: Currency,
  /** Contract multiplier used to convert price → notional. */
  multiplier: z.number().positive().default(1),
  tickSize: z.number().positive().default(0.01),
  lotSize: z.number().positive().default(1),
  tradable: z.boolean().default(true),
  details: InstrumentDetails,
});
export type Instrument = z.infer<typeof Instrument>;

export const CreateInstrumentInput = Instrument.omit({ id: true, createdAt: true, updatedAt: true });
export type CreateInstrumentInput = z.infer<typeof CreateInstrumentInput>;

export const Quote = z.object({
  instrumentId: z.string(),
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  mid: z.number(),
  bidSize: z.number().nonnegative(),
  askSize: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  /** Change since previous session close, fraction (0.012 = +1.2%). */
  changePct: z.number(),
  impliedVol: z.number().nullable().default(null),
  asOf: z.string(),
});
export type Quote = z.infer<typeof Quote>;

export const Bar = z.object({
  instrumentId: z.string(),
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative(),
});
export type Bar = z.infer<typeof Bar>;

export const BarInterval = z.enum(["1m", "5m", "15m", "1h", "1d"]);
export type BarInterval = z.infer<typeof BarInterval>;
