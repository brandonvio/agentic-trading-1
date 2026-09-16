/**
 * Coinbase Advanced Trade (mock): spot crypto, 24/7. Taker fee 0.4% of
 * notional. Fractional quantities allowed (governed by the instrument's lot
 * size). Spot only: no shorting (`supportsShort: false`); the mock still
 * accepts SELL orders and relies on the OMS to enforce flat-or-long.
 */
import type { Instrument } from "@/lib/domain/instrument";
import { MockBrokerAdapter, type MockAdapterOptions, type VenueProfile } from "./base-adapter";

export const COINBASE_TAKER_FEE = 0.004;

const PROFILE: VenueProfile = {
  capabilities: {
    broker: "coinbase",
    displayName: "Coinbase",
    assetClasses: ["crypto"],
    supportsShort: false,
    supportsLimit: true,
    supportsStop: true,
    sessionHours: "24/7",
    typicalLatencyMs: 150,
  },
  venue: "COINBASE",
  idPrefix: "CB",
  maxSlippageBps: 5,
  partialFillNotional: 250_000,
  marginRate: 1,
  degradedFailureRate: 0.15,
};

export class CoinbaseAdapter extends MockBrokerAdapter {
  constructor(opts: MockAdapterOptions) {
    super(PROFILE, opts);
  }

  protected commissionFor(_instrument: Instrument, quantity: number, price: number): number {
    return quantity * price * COINBASE_TAKER_FEE;
  }

  protected sessionMessage(): string {
    return "market open 24/7";
  }
}
