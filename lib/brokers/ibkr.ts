/**
 * Interactive Brokers (mock): US equities and listed options.
 * Commissions: equities $0.005/share (min $1, capped at 1% of trade value);
 * options $0.65/contract. Shorting allowed. RTH 09:30–16:00 ET is only
 * flagged in `health()`; orders outside RTH are still accepted.
 */
import type { Instrument } from "@/lib/domain/instrument";
import { MockBrokerAdapter, type MockAdapterOptions, type VenueProfile } from "./base-adapter";
import { isEquityRth } from "./sessions";

const PROFILE: VenueProfile = {
  capabilities: {
    broker: "ibkr",
    displayName: "Interactive Brokers",
    assetClasses: ["equity", "option"],
    supportsShort: true,
    supportsLimit: true,
    supportsStop: true,
    sessionHours: "RTH 09:30–16:00 ET Mon–Fri; extended 04:00–20:00 ET",
    typicalLatencyMs: 120,
  },
  venue: "SMART",
  idPrefix: "IBKR",
  maxSlippageBps: 2,
  partialFillNotional: 500_000,
  marginRate: 1,
  degradedFailureRate: 0.15,
};

export const IBKR_EQUITY_PER_SHARE = 0.005;
export const IBKR_EQUITY_MIN = 1;
export const IBKR_OPTION_PER_CONTRACT = 0.65;

export class InteractiveBrokersAdapter extends MockBrokerAdapter {
  constructor(opts: MockAdapterOptions) {
    super(PROFILE, opts);
  }

  protected commissionFor(instrument: Instrument, quantity: number, price: number): number {
    if (instrument.assetClass === "option") return quantity * IBKR_OPTION_PER_CONTRACT;
    const tradeValue = quantity * price;
    return Math.min(Math.max(quantity * IBKR_EQUITY_PER_SHARE, IBKR_EQUITY_MIN), tradeValue * 0.01);
  }

  protected sessionMessage(at: Date): string {
    return isEquityRth(at) ? "regular trading hours" : "outside regular trading hours (09:30–16:00 ET)";
  }
}
