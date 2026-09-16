/**
 * Broker adapter contract. One implementation per venue (IBKR, Oanda,
 * Tradovate, Coinbase, Kalshi). Mock implementations simulate realistic
 * behaviour (latency, partial fills, slippage, venue-specific rejects) and can
 * later be swapped for real API clients without touching the OMS.
 */
import type { BrokerKey, AssetClass, Instrument, Quote, Bar, BarInterval } from "@/lib/domain/instrument";
import type { Order, Fill } from "@/lib/domain/order";
import type { BrokerAccount } from "@/lib/domain/portfolio";

export interface BrokerCapabilities {
  broker: BrokerKey;
  displayName: string;
  assetClasses: AssetClass[];
  supportsShort: boolean;
  supportsLimit: boolean;
  supportsStop: boolean;
  /** Trading hours description, mock only. */
  sessionHours: string;
  /** Typical round-trip latency in ms for order acks (mock). */
  typicalLatencyMs: number;
}

export type BrokerConnectionStatus = "connected" | "degraded" | "disconnected" | "paper";

export interface BrokerHealth {
  broker: BrokerKey;
  status: BrokerConnectionStatus;
  latencyMs: number;
  lastHeartbeatAt: string;
  message: string;
}

export interface PlaceOrderRequest {
  order: Order;
  instrument: Instrument;
  account: BrokerAccount;
}

export type PlaceOrderResult =
  | {
      accepted: true;
      externalOrderId: string;
      /** Fills produced synchronously by the mock (may be partial or empty for resting limit orders). */
      fills: Fill[];
      status: "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED";
      message: string;
    }
  | { accepted: false; reason: string; code: "REJECTED_BY_VENUE" | "INSUFFICIENT_MARGIN" | "MARKET_CLOSED" | "INVALID_ORDER" | "CONNECTIVITY" };

export interface CancelOrderResult {
  cancelled: boolean;
  message: string;
}

export interface BrokerAccountSnapshot {
  externalAccountId: string;
  cashBalance: number;
  buyingPower: number;
  marginUsed: number;
  /** Broker-side positions; used for reconciliation. */
  positions: Array<{ symbol: string; quantity: number; averagePrice: number; markPrice: number }>;
}

export interface BrokerAdapter {
  readonly key: BrokerKey;
  capabilities(): BrokerCapabilities;
  health(): Promise<BrokerHealth>;
  /** Snapshot quote for an instrument. */
  getQuote(instrument: Instrument): Promise<Quote>;
  getQuotes(instruments: Instrument[]): Promise<Quote[]>;
  getBars(instrument: Instrument, interval: BarInterval, count: number, endTime?: string): Promise<Bar[]>;
  placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult>;
  cancelOrder(externalOrderId: string): Promise<CancelOrderResult>;
  getAccountSnapshot(account: BrokerAccount): Promise<BrokerAccountSnapshot>;
}

export interface BrokerRegistry {
  get(key: BrokerKey): BrokerAdapter;
  forAssetClass(assetClass: AssetClass): BrokerAdapter;
  all(): BrokerAdapter[];
}
