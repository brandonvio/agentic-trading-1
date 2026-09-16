/**
 * Kalshi (mock): CFTC-regulated event contracts. Prices are YES prices in
 * dollars (0.01–0.99, cent ticks); quantity is contracts; each contract
 * settles at 1.00 (YES) or 0.00 (NO). Fee ≈ 0.07 × price × (1 − price) per
 * contract, rounded up to the cent. No shorting: a SELL is a sale of YES.
 */
import type { Instrument } from "@/lib/domain/instrument";
import { MockBrokerAdapter, type MockAdapterOptions, type OrderRejection, type VenueProfile } from "./base-adapter";
import type { PlaceOrderRequest } from "./types";

export const KALSHI_FEE_RATE = 0.07;
export const KALSHI_MIN_PRICE = 0.01;
export const KALSHI_MAX_PRICE = 0.99;

const PROFILE: VenueProfile = {
  capabilities: {
    broker: "kalshi",
    displayName: "Kalshi",
    assetClasses: ["event"],
    supportsShort: false,
    supportsLimit: true,
    supportsStop: false,
    sessionHours: "24/7 order entry until market close; contracts settle at 1.00 (YES) / 0.00 (NO)",
    typicalLatencyMs: 200,
  },
  venue: "KALSHI",
  idPrefix: "KX",
  maxSlippageBps: 0,
  partialFillNotional: 25_000,
  marginRate: 1,
  degradedFailureRate: 0.15,
};

/** Kalshi-style fee: 0.07 × p × (1 − p) per contract, rounded up to the cent. */
export function kalshiFee(price: number, contracts: number): number {
  return Math.ceil(KALSHI_FEE_RATE * price * (1 - price) * contracts * 100) / 100;
}

export class KalshiAdapter extends MockBrokerAdapter {
  constructor(opts: MockAdapterOptions) {
    super(PROFILE, opts);
  }

  protected tickFor(): number {
    return 0.01;
  }

  protected validateVenue(req: PlaceOrderRequest): OrderRejection | null {
    const { order } = req;
    if (!Number.isInteger(order.quantity)) return { accepted: false, code: "INVALID_ORDER", reason: "Quantity must be a whole number of contracts" };
    const limit = order.limitPrice;
    if (limit !== null && (limit < KALSHI_MIN_PRICE || limit > KALSHI_MAX_PRICE)) {
      return { accepted: false, code: "INVALID_ORDER", reason: `Limit price ${limit} must be between 0.01 and 0.99` };
    }
    return null;
  }

  protected commissionFor(_instrument: Instrument, quantity: number, price: number): number {
    return kalshiFee(price, quantity);
  }

  protected sessionMessage(): string {
    return "exchange open; contracts settle 1.00/0.00 at market close";
  }
}
