/**
 * Shared behaviour for every mock broker adapter: quotes/bars come from the
 * MarketSimulator; `placeOrder` simulates connectivity, validation, margin,
 * fills (full / partial / resting) with slippage and a venue commission model.
 * Concrete adapters (IBKR, Oanda, Tradovate, Coinbase, Kalshi) supply a
 * `VenueProfile`, a commission model, tick rules and session messaging.
 */
import type { Clock } from "@/lib/core/clock";
import type { Bar, BarInterval, BrokerKey, Instrument, Quote } from "@/lib/domain/instrument";
import type { Fill, Order } from "@/lib/domain/order";
import type { BrokerAccount } from "@/lib/domain/portfolio";
import type { MarketSimulator } from "./market-simulator";
import { floorToStep, isMultipleOf, roundToTick } from "./pricing";
import { SeededRandom, combineSeeds, hashString } from "./prng";
import type {
  BrokerAccountSnapshot,
  BrokerAdapter,
  BrokerCapabilities,
  BrokerConnectionStatus,
  BrokerHealth,
  CancelOrderResult,
  PlaceOrderRequest,
  PlaceOrderResult,
} from "./types";

export interface MockAdapterOptions {
  simulator: MarketSimulator;
  clock: Clock;
  /** Seed for this adapter's own PRNG (slippage, partial fills, ids); default: simulator seed. */
  seed?: number;
  /** When true, `placeOrder` and `health` await a simulated round-trip. Default false (tests). */
  simulateLatency?: boolean;
  /** Fixed round-trip in ms when simulating latency; default: sampled around `typicalLatencyMs`. */
  latencyMs?: number;
}

/** Static venue characteristics a concrete adapter declares. */
export interface VenueProfile {
  capabilities: BrokerCapabilities;
  /** Venue label stamped on fills. */
  venue: string;
  /** Prefix for external order / fill ids. */
  idPrefix: string;
  /** Upper bound of market-order slippage in basis points of price. */
  maxSlippageBps: number;
  /** Notional above which marketable orders fill only partially (60–90%). */
  partialFillNotional: number;
  /** Fraction of notional that must be covered by buying power (1 = fully funded). */
  marginRate: number;
  /** Probability that a request on a 'degraded' account fails with CONNECTIVITY. */
  degradedFailureRate: number;
}

export type OrderRejection = Extract<PlaceOrderResult, { accepted: false }>;

const reject = (code: OrderRejection["code"], reason: string): OrderRejection => ({ accepted: false, code, reason });

/** Abstract base for simulated broker adapters. */
export abstract class MockBrokerAdapter implements BrokerAdapter {
  readonly key: BrokerKey;
  protected readonly clock: Clock;
  protected readonly simulator: MarketSimulator;
  protected readonly rng: SeededRandom;
  private readonly simulateLatency: boolean;
  private readonly fixedLatencyMs: number | undefined;
  private status: BrokerConnectionStatus = "connected";
  private orderCounter = 0;
  private readonly openOrders = new Set<string>();

  protected constructor(
    protected readonly profile: VenueProfile,
    opts: MockAdapterOptions,
  ) {
    this.key = profile.capabilities.broker;
    this.clock = opts.clock;
    this.simulator = opts.simulator;
    this.rng = new SeededRandom(combineSeeds(opts.seed ?? opts.simulator.seed, hashString(this.key)));
    this.simulateLatency = opts.simulateLatency ?? false;
    this.fixedLatencyMs = opts.latencyMs;
  }

  // --- hooks for concrete venues ------------------------------------------

  /** Commission (in account currency) for one execution. */
  protected abstract commissionFor(instrument: Instrument, quantity: number, price: number): number;

  /** Human-readable session state for `health()`. */
  protected abstract sessionMessage(at: Date): string;

  /** Venue price increment for an instrument (default: the instrument's own tick). */
  protected tickFor(instrument: Instrument): number {
    return instrument.tickSize;
  }

  /** Venue-specific validation; return a rejection to stop processing. */
  protected validateVenue(req: PlaceOrderRequest): OrderRejection | null {
    void req;
    return null;
  }

  /** Broker-side positions for a snapshot (default: none). */
  protected snapshotPositions(account: BrokerAccount): BrokerAccountSnapshot["positions"] {
    void account;
    return [];
  }

  // --- status / health ----------------------------------------------------

  /** Overrides the adapter's connection status (ops toggles, tests). */
  setStatus(status: BrokerConnectionStatus): void {
    this.status = status;
  }

  getStatus(): BrokerConnectionStatus {
    return this.status;
  }

  capabilities(): BrokerCapabilities {
    return { ...this.profile.capabilities, assetClasses: [...this.profile.capabilities.assetClasses] };
  }

  async health(): Promise<BrokerHealth> {
    await this.roundTrip();
    const now = this.clock.now();
    const statusNote: Record<BrokerConnectionStatus, string> = {
      connected: "connected",
      paper: "paper-trading session",
      degraded: "degraded: elevated latency and intermittent failures",
      disconnected: "disconnected: no session",
    };
    return {
      broker: this.key,
      status: this.status,
      latencyMs: this.status === "disconnected" ? 0 : this.sampleLatency(),
      lastHeartbeatAt: now.toISOString(),
      message: `${this.profile.capabilities.displayName} ${statusNote[this.status]}; ${this.sessionMessage(now)}`,
    };
  }

  // --- market data --------------------------------------------------------

  async getQuote(instrument: Instrument): Promise<Quote> {
    return this.simulator.quote(this.effective(instrument), this.clock.now());
  }

  async getQuotes(instruments: Instrument[]): Promise<Quote[]> {
    const now = this.clock.now();
    return instruments.map((i) => this.simulator.quote(this.effective(i), now));
  }

  async getBars(instrument: Instrument, interval: BarInterval, count: number, endTime?: string): Promise<Bar[]> {
    const end = endTime ? new Date(endTime) : this.clock.now();
    return this.simulator.bars(this.effective(instrument), interval, count, end);
  }

  // --- orders -------------------------------------------------------------

  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
    await this.roundTrip();
    const connectivity = this.checkConnectivity(req.account);
    if (connectivity) return connectivity;
    const invalid = this.validate(req) ?? this.validateVenue(req);
    if (invalid) return invalid;

    const { order, account } = req;
    const instrument = this.effective(req.instrument);
    const tick = instrument.tickSize;
    const quote = this.simulator.quote(instrument, this.clock.now());
    const refPrice = order.limitPrice ?? (order.side === "BUY" ? quote.ask : quote.bid);
    const notional = order.quantity * refPrice * instrument.multiplier;
    if (notional * this.profile.marginRate > account.buyingPower) {
      return reject(
        "INSUFFICIENT_MARGIN",
        `Required margin ${(notional * this.profile.marginRate).toFixed(2)} exceeds buying power ${account.buyingPower.toFixed(2)}`,
      );
    }

    const externalOrderId = this.nextOrderId();
    this.openOrders.add(externalOrderId);
    const fillPrice = this.fillPriceFor(order, quote, tick);
    if (fillPrice === null) {
      const resting = order.type === "LIMIT" ? "not marketable" : "resting until stop triggers";
      return { accepted: true, externalOrderId, fills: [], status: "ACKNOWLEDGED", message: `${order.type} order acknowledged (${resting})` };
    }

    const filledQty = this.fillQuantityFor(order, instrument, notional);
    const fill = this.buildFill(order, instrument, filledQty, fillPrice);
    const partial = filledQty < order.quantity;
    if (!partial) this.openOrders.delete(externalOrderId);
    return {
      accepted: true,
      externalOrderId,
      fills: [fill],
      status: partial ? "PARTIALLY_FILLED" : "FILLED",
      message: partial
        ? `Partially filled ${filledQty} of ${order.quantity} @ ${fillPrice} on ${this.profile.venue}`
        : `Filled ${filledQty} @ ${fillPrice} on ${this.profile.venue}`,
    };
  }

  async cancelOrder(externalOrderId: string): Promise<CancelOrderResult> {
    await this.roundTrip();
    const known = this.openOrders.delete(externalOrderId);
    return { cancelled: true, message: known ? `Order ${externalOrderId} cancelled` : `Order ${externalOrderId} not open; treated as cancelled` };
  }

  async getAccountSnapshot(account: BrokerAccount): Promise<BrokerAccountSnapshot> {
    await this.roundTrip();
    const jitter = (v: number) => Math.round(v * (1 + this.rng.range(-0.0001, 0.0001)) * 100) / 100;
    return {
      externalAccountId: account.externalAccountId,
      cashBalance: jitter(account.cashBalance),
      buyingPower: jitter(account.buyingPower),
      marginUsed: Math.max(0, jitter(account.marginUsed)),
      positions: this.snapshotPositions(account),
    };
  }

  // --- internals ----------------------------------------------------------

  /** Instrument with the venue's tick applied (so quotes/fills honour venue increments). */
  protected effective(instrument: Instrument): Instrument {
    const tick = this.tickFor(instrument);
    return tick === instrument.tickSize ? instrument : { ...instrument, tickSize: tick };
  }

  private checkConnectivity(account: BrokerAccount): OrderRejection | null {
    if (this.status === "disconnected" || account.status === "disconnected") {
      return reject("CONNECTIVITY", `${this.profile.capabilities.displayName} session is disconnected`);
    }
    const degraded = this.status === "degraded" || account.status === "degraded";
    if (degraded && this.rng.chance(this.profile.degradedFailureRate)) {
      return reject("CONNECTIVITY", `${this.profile.capabilities.displayName} request timed out (degraded connection)`);
    }
    return null;
  }

  private validate(req: PlaceOrderRequest): OrderRejection | null {
    const { order, instrument: raw } = req;
    const caps = this.profile.capabilities;
    if (raw.broker !== this.key) return reject("REJECTED_BY_VENUE", `Instrument ${raw.symbol} is routed to ${raw.broker}, not ${this.key}`);
    if (!caps.assetClasses.includes(raw.assetClass)) {
      return reject("REJECTED_BY_VENUE", `${caps.displayName} does not trade ${raw.assetClass}`);
    }
    if (!raw.tradable) return reject("INVALID_ORDER", `Instrument ${raw.symbol} is not tradable`);
    if (!(order.quantity > 0)) return reject("INVALID_ORDER", "Quantity must be positive");
    if (!isMultipleOf(order.quantity, raw.lotSize)) {
      return reject("INVALID_ORDER", `Quantity ${order.quantity} is not a multiple of lot size ${raw.lotSize}`);
    }
    if (order.type === "LIMIT" && !caps.supportsLimit) return reject("REJECTED_BY_VENUE", `${caps.displayName} does not support LIMIT orders`);
    if ((order.type === "STOP" || order.type === "STOP_LIMIT") && !caps.supportsStop) {
      return reject("REJECTED_BY_VENUE", `${caps.displayName} does not support stop orders`);
    }
    const tick = this.tickFor(raw);
    if (order.type === "LIMIT" || order.type === "STOP_LIMIT") {
      if (order.limitPrice === null) return reject("INVALID_ORDER", `${order.type} order requires a limit price`);
      if (!isMultipleOf(order.limitPrice, tick)) return reject("INVALID_ORDER", `Limit price ${order.limitPrice} is not a multiple of tick ${tick}`);
    }
    if (order.type === "STOP" || order.type === "STOP_LIMIT") {
      if (order.stopPrice === null) return reject("INVALID_ORDER", `${order.type} order requires a stop price`);
      if (!isMultipleOf(order.stopPrice, tick)) return reject("INVALID_ORDER", `Stop price ${order.stopPrice} is not a multiple of tick ${tick}`);
    }
    return null;
  }

  /** Execution price, or null when the order rests (non-marketable limit, stops). */
  private fillPriceFor(order: Order, quote: Quote, tick: number): number | null {
    if (order.type === "STOP" || order.type === "STOP_LIMIT") return null;
    if (order.type === "LIMIT") {
      const limit = order.limitPrice ?? 0;
      if (order.side === "BUY") return limit >= quote.ask ? Math.min(limit, quote.ask) : null;
      return limit <= quote.bid ? Math.max(limit, quote.bid) : null;
    }
    const slip = this.rng.range(0, this.profile.maxSlippageBps) / 10_000;
    const raw = order.side === "BUY" ? quote.ask * (1 + slip) : quote.bid * (1 - slip);
    return Math.max(tick, roundToTick(raw, tick));
  }

  /** Full quantity, or 60–90% (lot-aligned) when notional exceeds the venue's partial-fill threshold. */
  private fillQuantityFor(order: Order, instrument: Instrument, notional: number): number {
    if (notional <= this.profile.partialFillNotional) return order.quantity;
    const partial = floorToStep(order.quantity * this.rng.range(0.6, 0.9), instrument.lotSize);
    return partial >= instrument.lotSize ? partial : order.quantity;
  }

  private buildFill(order: Order, instrument: Instrument, quantity: number, price: number): Fill {
    const tag = this.hex(8);
    return {
      id: `fill_${this.profile.idPrefix.toLowerCase()}${tag}`,
      orderId: order.id,
      portfolioId: order.portfolioId,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      side: order.side,
      quantity,
      price,
      commission: Math.round(this.commissionFor(instrument, quantity, price) * 100) / 100,
      externalFillId: `${this.profile.idPrefix}-F-${tag}`,
      venue: this.profile.venue,
      executedAt: this.clock.nowIso(),
    };
  }

  private nextOrderId(): string {
    this.orderCounter += 1;
    return `${this.profile.idPrefix}-O-${String(this.orderCounter).padStart(6, "0")}-${this.hex(6)}`;
  }

  private hex(length: number): string {
    let out = "";
    while (out.length < length) out += Math.floor(this.rng.next() * 0xffffffff).toString(16).padStart(8, "0");
    return out.slice(0, length);
  }

  private sampleLatency(): number {
    const typical = this.profile.capabilities.typicalLatencyMs;
    const factor = this.status === "degraded" ? 3 : 1;
    return Math.round(typical * this.rng.range(0.6, 1.6) * factor);
  }

  private async roundTrip(): Promise<void> {
    if (!this.simulateLatency) return;
    const ms = this.fixedLatencyMs ?? this.sampleLatency();
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
