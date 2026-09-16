/**
 * OANDA (mock): spot FX. No commission — cost is the bid/ask spread.
 * Quantity is in base-currency units. Prices honour 5 decimals (3 for JPY
 * quotes), i.e. one tenth of a pip. Session 24/5, flagged in `health()`.
 */
import type { Instrument } from "@/lib/domain/instrument";
import { MockBrokerAdapter, type MockAdapterOptions, type VenueProfile } from "./base-adapter";
import { isFxSessionOpen } from "./sessions";

const PROFILE: VenueProfile = {
  capabilities: {
    broker: "oanda",
    displayName: "OANDA",
    assetClasses: ["forex"],
    supportsShort: true,
    supportsLimit: true,
    supportsStop: true,
    sessionHours: "24/5: Sunday 17:00 ET – Friday 17:00 ET",
    typicalLatencyMs: 80,
  },
  venue: "OANDA",
  idPrefix: "OANDA",
  maxSlippageBps: 0.5,
  partialFillNotional: 5_000_000,
  marginRate: 0.02, // 50:1 leverage
  degradedFailureRate: 0.15,
};

export class OandaAdapter extends MockBrokerAdapter {
  constructor(opts: MockAdapterOptions) {
    super(PROFILE, opts);
  }

  /** Tenth-of-a-pip pricing: 0.00001 for most pairs, 0.001 for JPY quotes. */
  protected tickFor(instrument: Instrument): number {
    if (instrument.details.assetClass !== "forex") return instrument.tickSize;
    return instrument.details.quoteCurrency === "JPY" ? 0.001 : 0.00001;
  }

  protected commissionFor(): number {
    return 0;
  }

  protected sessionMessage(at: Date): string {
    return isFxSessionOpen(at) ? "FX market open" : "FX market closed (weekend)";
  }
}
