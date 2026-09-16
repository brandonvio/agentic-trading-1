/** Inline fixtures for broker tests. Everything is parsed through the zod schemas so it is a valid domain object. */
import { FixedClock } from "@/lib/core/clock";
import { Instrument, type InstrumentDetails } from "@/lib/domain/instrument";
import { Order } from "@/lib/domain/order";
import { BrokerAccount } from "@/lib/domain/portfolio";
import { MarketSimulator } from "@/lib/brokers/market-simulator";

export const T0 = "2026-09-03T14:30:00.000Z"; // Thursday 10:30 ET
export const TS = { createdAt: T0, updatedAt: T0 };

export function clockAt(iso: string = T0): FixedClock {
  return new FixedClock(iso);
}

export function simulator(clock = clockAt(), seed = 42): MarketSimulator {
  return new MarketSimulator({ clock, seed });
}

type InstrumentOverrides = Partial<Omit<Instrument, "details">>;

function instrument(base: Omit<Instrument, "createdAt" | "updatedAt">, overrides: InstrumentOverrides = {}): Instrument {
  return Instrument.parse({ ...TS, ...base, ...overrides });
}

export const SPY = (o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: "ins_spy",
      symbol: "SPY",
      name: "SPDR S&P 500 ETF",
      assetClass: "equity",
      broker: "ibkr",
      venue: "ARCA",
      currency: "USD",
      multiplier: 1,
      tickSize: 0.01,
      lotSize: 1,
      tradable: true,
      details: { assetClass: "equity", exchange: "ARCA", sector: "Index" },
    },
    o,
  );

export const SPY_CALL = (strike = 620, expiry = "2026-12-18", o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: `ins_spy_c${strike}`,
      symbol: `SPY ${expiry.replace(/-/g, "").slice(2)}C${String(strike * 1000).padStart(8, "0")}`,
      name: `SPY ${expiry} ${strike} Call`,
      assetClass: "option",
      broker: "ibkr",
      venue: "CBOE",
      currency: "USD",
      multiplier: 100,
      tickSize: 0.01,
      lotSize: 1,
      tradable: true,
      details: { assetClass: "option", underlyingSymbol: "SPY", strike, expiry, right: "CALL", multiplier: 100 },
    },
    o,
  );

export const SPY_PUT = (strike = 620, expiry = "2026-12-18") =>
  instrument({
    id: `ins_spy_p${strike}`,
    symbol: `SPY ${expiry.replace(/-/g, "").slice(2)}P${String(strike * 1000).padStart(8, "0")}`,
    name: `SPY ${expiry} ${strike} Put`,
    assetClass: "option",
    broker: "ibkr",
    venue: "CBOE",
    currency: "USD",
    multiplier: 100,
    tickSize: 0.01,
    lotSize: 1,
    tradable: true,
    details: { assetClass: "option", underlyingSymbol: "SPY", strike, expiry, right: "PUT", multiplier: 100 },
  });

export const EURUSD = (o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: "ins_eurusd",
      symbol: "EUR/USD",
      name: "Euro / US Dollar",
      assetClass: "forex",
      broker: "oanda",
      venue: "OANDA",
      currency: "USD",
      multiplier: 1,
      tickSize: 0.00001,
      lotSize: 1,
      tradable: true,
      details: { assetClass: "forex", baseCurrency: "EUR", quoteCurrency: "USD", pipSize: 0.0001 },
    },
    o,
  );

export const USDJPY = () =>
  instrument({
    id: "ins_usdjpy",
    symbol: "USD/JPY",
    name: "US Dollar / Japanese Yen",
    assetClass: "forex",
    broker: "oanda",
    venue: "OANDA",
    currency: "JPY",
    multiplier: 1,
    tickSize: 0.001,
    lotSize: 1,
    tradable: true,
    details: { assetClass: "forex", baseCurrency: "USD", quoteCurrency: "JPY", pipSize: 0.01 },
  });

export const future = (root: string, multiplier: number, tickSize: number, o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: `ins_${root.toLowerCase()}z6`,
      symbol: `${root}Z6`,
      name: `${root} Dec 2026`,
      assetClass: "future",
      broker: "tradovate",
      venue: "CME",
      currency: "USD",
      multiplier,
      tickSize,
      lotSize: 1,
      tradable: true,
      details: { assetClass: "future", rootSymbol: root, expiry: "2026-12-18", multiplier, tickSize },
    },
    o,
  );

export const ESZ6 = (o: InstrumentOverrides = {}) => future("ES", 50, 0.25, o);
export const CLZ6 = () => future("CL", 1000, 0.01);
export const GCZ6 = () => future("GC", 100, 0.1);
export const ZNZ6 = () => future("ZN", 1000, 1 / 64);
export const E6Z6 = () => future("6E", 125_000, 0.00005);

export const BTCUSD = (o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: "ins_btcusd",
      symbol: "BTC-USD",
      name: "Bitcoin / USD",
      assetClass: "crypto",
      broker: "coinbase",
      venue: "COINBASE",
      currency: "USD",
      multiplier: 1,
      tickSize: 0.01,
      lotSize: 0.00001,
      tradable: true,
      details: { assetClass: "crypto", baseAsset: "BTC", quoteAsset: "USD" },
    },
    o,
  );

export const FED_CUT = (o: InstrumentOverrides = {}) =>
  instrument(
    {
      id: "ins_fed_dec26_cut",
      symbol: "FED-DEC26-CUT",
      name: "Fed cuts rates in December 2026",
      assetClass: "event",
      broker: "kalshi",
      venue: "KALSHI",
      currency: "USD",
      multiplier: 1,
      tickSize: 0.01,
      lotSize: 1,
      tradable: true,
      details: {
        assetClass: "event",
        question: "Will the Fed cut rates at the December 2026 FOMC meeting?",
        closeTime: "2026-12-16T19:00:00.000Z",
        settlementValue: 1,
      },
    },
    o,
  );

export function withDetails(i: Instrument, details: InstrumentDetails): Instrument {
  return Instrument.parse({ ...i, details });
}

export function account(o: Partial<BrokerAccount> = {}): BrokerAccount {
  return BrokerAccount.parse({
    ...TS,
    id: "acct_test",
    portfolioId: "pf_test",
    broker: "ibkr",
    externalAccountId: "U1234567",
    label: "Test account",
    currency: "USD",
    status: "connected",
    cashBalance: 1_000_000,
    buyingPower: 2_000_000,
    marginUsed: 0,
    lastHeartbeatAt: T0,
    ...o,
  });
}

export function order(i: Instrument, o: Partial<Order> = {}): Order {
  return Order.parse({
    ...TS,
    id: "ord_test",
    portfolioId: "pf_test",
    brokerAccountId: "acct_test",
    broker: i.broker,
    instrumentId: i.id,
    symbol: i.symbol,
    assetClass: i.assetClass,
    side: "BUY",
    type: "MARKET",
    quantity: 100,
    timeInForce: "DAY",
    status: "ROUTED",
    origin: "manual",
    createdBy: { kind: "user", id: "usr_test", name: "Test User" },
    estimatedNotional: 0,
    ...o,
  });
}
