/**
 * Controllable broker fakes for service tests.
 *
 * Deliberately independent of lib/brokers/** so a change in the mock adapters
 * cannot silently alter what the service tests assert.
 */
import type { BrokerAdapter, BrokerRegistry, BrokerCapabilities, BrokerHealth, PlaceOrderRequest, PlaceOrderResult, CancelOrderResult, BrokerAccountSnapshot } from "@/lib/brokers/types";
import type { BrokerKey, AssetClass, Instrument, Quote, Bar, BarInterval } from "@/lib/domain/instrument";
import { ASSET_CLASS_BROKER } from "@/lib/domain/instrument";
import type { BrokerAccount } from "@/lib/domain/portfolio";
import type { Fill } from "@/lib/domain/order";

export interface FakeBrokerOptions {
  /** Price returned for every quote and used for fills. */
  price?: number;
  /** Commission charged per fill. */
  commission?: number;
  /** Fraction of the order quantity that fills (1 = full). */
  fillRatio?: number;
  /** When set, placeOrder rejects with this reason/code. */
  reject?: { reason: string; code: PlaceOrderResult extends { accepted: false } ? never : "REJECTED_BY_VENUE" | "INSUFFICIENT_MARGIN" | "MARKET_CLOSED" | "INVALID_ORDER" | "CONNECTIVITY" };
  /** When true, LIMIT orders rest instead of filling. */
  restLimits?: boolean;
}

export class FakeBrokerAdapter implements BrokerAdapter {
  /** Every request this adapter received, for assertions. */
  readonly placed: PlaceOrderRequest[] = [];
  readonly cancelled: string[] = [];
  private seq = 0;
  price: number;
  commission: number;
  fillRatio: number;
  restLimits: boolean;
  reject: { reason: string; code: "REJECTED_BY_VENUE" | "INSUFFICIENT_MARGIN" | "MARKET_CLOSED" | "INVALID_ORDER" | "CONNECTIVITY" } | null = null;
  status: BrokerHealth["status"] = "connected";

  constructor(
    readonly key: BrokerKey,
    opts: Omit<FakeBrokerOptions, "reject"> = {},
  ) {
    this.price = opts.price ?? 100;
    this.commission = opts.commission ?? 1;
    this.fillRatio = opts.fillRatio ?? 1;
    this.restLimits = opts.restLimits ?? false;
  }

  capabilities(): BrokerCapabilities {
    return {
      broker: this.key,
      displayName: `Fake ${this.key}`,
      assetClasses: ["equity", "option", "future", "forex", "crypto", "event"],
      supportsShort: true,
      supportsLimit: true,
      supportsStop: true,
      sessionHours: "24/7 (fake)",
      typicalLatencyMs: 0,
    };
  }

  async health(): Promise<BrokerHealth> {
    return { broker: this.key, status: this.status, latencyMs: 5, lastHeartbeatAt: "2026-09-03T14:30:00.000Z", message: "fake adapter" };
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    return {
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      bid: this.price - 0.05,
      ask: this.price + 0.05,
      last: this.price,
      mid: this.price,
      bidSize: 500,
      askSize: 500,
      volume: 1_000_000,
      changePct: 0.004,
      impliedVol: instrument.assetClass === "option" ? 0.22 : null,
      asOf: "2026-09-03T14:30:00.000Z",
    };
  }

  async getQuotes(instruments: Instrument[]): Promise<Quote[]> {
    return Promise.all(instruments.map((i) => this.getQuote(i)));
  }

  async getBars(instrument: Instrument, _interval: BarInterval, count: number): Promise<Bar[]> {
    return Array.from({ length: count }, (_, i) => ({
      instrumentId: instrument.id,
      time: new Date(Date.parse("2026-09-03T00:00:00.000Z") + i * 60_000).toISOString(),
      open: this.price,
      high: this.price + 1,
      low: this.price - 1,
      close: this.price,
      volume: 1000,
    }));
  }

  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
    this.placed.push(req);
    if (this.reject) return { accepted: false, reason: this.reject.reason, code: this.reject.code };

    const { order, instrument } = req;
    const externalOrderId = `fake-${this.key}-${++this.seq}`;
    if (this.restLimits && order.type !== "MARKET") {
      return { accepted: true, externalOrderId, fills: [], status: "ACKNOWLEDGED", message: "resting" };
    }

    const qty = order.quantity * this.fillRatio;
    if (qty <= 0) return { accepted: true, externalOrderId, fills: [], status: "ACKNOWLEDGED", message: "no fill" };

    const price = order.limitPrice ?? this.price;
    const fill: Fill = {
      id: `fill_fake_${this.key}_${this.seq}`,
      orderId: order.id,
      portfolioId: order.portfolioId,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      side: order.side,
      quantity: qty,
      price,
      commission: this.commission,
      externalFillId: `x-${this.key}-${this.seq}`,
      venue: instrument.venue,
      executedAt: "2026-09-03T14:30:05.000Z",
    };
    return {
      accepted: true,
      externalOrderId,
      fills: [fill],
      status: this.fillRatio >= 1 ? "FILLED" : "PARTIALLY_FILLED",
      message: "ok",
    };
  }

  async cancelOrder(externalOrderId: string): Promise<CancelOrderResult> {
    this.cancelled.push(externalOrderId);
    return { cancelled: true, message: "cancelled" };
  }

  async getAccountSnapshot(account: BrokerAccount): Promise<BrokerAccountSnapshot> {
    return {
      externalAccountId: account.externalAccountId,
      cashBalance: account.cashBalance,
      buyingPower: account.buyingPower,
      marginUsed: account.marginUsed,
      positions: [],
    };
  }
}

export class FakeBrokerRegistry implements BrokerRegistry {
  readonly adapters = new Map<BrokerKey, FakeBrokerAdapter>();

  constructor(opts: FakeBrokerOptions = {}) {
    for (const key of ["ibkr", "oanda", "tradovate", "coinbase", "kalshi"] as const) {
      this.adapters.set(key, new FakeBrokerAdapter(key, opts));
    }
  }

  get(key: BrokerKey): FakeBrokerAdapter {
    const adapter = this.adapters.get(key);
    if (!adapter) throw new Error(`No fake adapter for ${key}`);
    return adapter;
  }

  forAssetClass(assetClass: AssetClass): FakeBrokerAdapter {
    return this.get(ASSET_CLASS_BROKER[assetClass]);
  }

  all(): FakeBrokerAdapter[] {
    return [...this.adapters.values()];
  }

  /** Apply a setting to every adapter. */
  configure(fn: (a: FakeBrokerAdapter) => void): void {
    for (const a of this.adapters.values()) fn(a);
  }
}
