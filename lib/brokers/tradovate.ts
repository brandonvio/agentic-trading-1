/**
 * Tradovate (mock): CME/CBOT/NYMEX/COMEX futures. $1.29 per contract per
 * side. Prices are rounded to the contract's exchange tick (ES/NQ 0.25,
 * CL 0.01, GC 0.10, ZN 1/64, 6E 0.00005). Margin ~6% of notional. Session
 * nearly 23h/day, flagged in `health()`.
 */
import type { Instrument } from "@/lib/domain/instrument";
import { MockBrokerAdapter, type MockAdapterOptions, type VenueProfile } from "./base-adapter";
import { isFuturesSessionOpen } from "./sessions";

/** Exchange minimum price increments by root symbol. */
export const FUTURES_TICKS: Record<string, number> = {
  ES: 0.25,
  NQ: 0.25,
  YM: 1,
  RTY: 0.1,
  CL: 0.01,
  GC: 0.1,
  SI: 0.005,
  ZN: 1 / 64,
  ZB: 1 / 32,
  "6E": 0.00005,
  "6J": 0.0000005,
  NG: 0.001,
  HG: 0.0005,
};

export const TRADOVATE_PER_CONTRACT = 1.29;

const PROFILE: VenueProfile = {
  capabilities: {
    broker: "tradovate",
    displayName: "Tradovate",
    assetClasses: ["future"],
    supportsShort: true,
    supportsLimit: true,
    supportsStop: true,
    sessionHours: "Globex: Sunday 18:00 ET – Friday 17:00 ET, daily halt 17:00–18:00 ET",
    typicalLatencyMs: 60,
  },
  venue: "CME",
  idPrefix: "TDV",
  maxSlippageBps: 0.5,
  partialFillNotional: 2_000_000,
  marginRate: 0.06,
  degradedFailureRate: 0.15,
};

export class TradovateAdapter extends MockBrokerAdapter {
  constructor(opts: MockAdapterOptions) {
    super(PROFILE, opts);
  }

  protected tickFor(instrument: Instrument): number {
    if (instrument.details.assetClass !== "future") return instrument.tickSize;
    return FUTURES_TICKS[instrument.details.rootSymbol] ?? instrument.details.tickSize;
  }

  protected commissionFor(_instrument: Instrument, quantity: number): number {
    return quantity * TRADOVATE_PER_CONTRACT;
  }

  protected sessionMessage(at: Date): string {
    return isFuturesSessionOpen(at) ? "Globex session open" : "Globex session closed (maintenance halt or weekend)";
  }
}
