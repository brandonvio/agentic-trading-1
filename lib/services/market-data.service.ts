import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { Instrument, AssetClass, BrokerKey, Quote, Bar, BarInterval } from "@/lib/domain/instrument";
import type { InstrumentRepository } from "@/lib/repositories/interfaces";
import type { BrokerRegistry } from "@/lib/brokers/types";
import type { Clock } from "@/lib/core/clock";
import { NotFoundError } from "@/lib/core/errors";
import type { MarketDataService, MarketOverview } from "./interfaces";
import { ALL_ROWS, requirePermission } from "./authz";
import { buildEventCalendar, classifyRegime, headlineFor, type BenchmarkSpec, BENCHMARKS, frontMonthFuture } from "./helpers/market-overview";

/** Instruments from the repository; quotes and bars from the broker adapter that owns each instrument. */
export class MarketDataServiceImpl implements MarketDataService {
  constructor(
    private readonly instruments: InstrumentRepository,
    private readonly brokers: BrokerRegistry,
    private readonly clock: Clock,
  ) {}

  /** Requires market:read. */
  async getInstrument(principal: Principal, id: string): Promise<Instrument> {
    requirePermission(principal, "market:read");
    const instrument = await this.instruments.findById(id);
    if (!instrument) throw new NotFoundError("Instrument", id);
    return instrument;
  }

  /** Requires market:read. */
  async listInstruments(principal: Principal, filter: { assetClass?: AssetClass; broker?: BrokerKey; search?: string }, page: PageQuery): Promise<Paged<Instrument>> {
    requirePermission(principal, "market:read");
    return this.instruments.list(filter, page);
  }

  /** Requires market:read. Quote from the instrument's broker adapter. */
  async getQuote(principal: Principal, instrumentId: string): Promise<Quote> {
    const instrument = await this.getInstrument(principal, instrumentId);
    return this.brokers.get(instrument.broker).getQuote(instrument);
  }

  /** Requires market:read. Batches quote requests per broker; unknown ids are skipped. */
  async getQuotes(principal: Principal, instrumentIds: string[]): Promise<Quote[]> {
    requirePermission(principal, "market:read");
    const instruments = await this.instruments.listByIds(instrumentIds);
    return this.quotesFor(instruments);
  }

  /** Requires market:read. Bars ending at the current clock time. */
  async getBars(principal: Principal, instrumentId: string, interval: BarInterval, count: number): Promise<Bar[]> {
    const instrument = await this.getInstrument(principal, instrumentId);
    return this.brokers.get(instrument.broker).getBars(instrument, interval, count, this.clock.nowIso());
  }

  /**
   * Requires market:read. Benchmarks are looked up by symbol (SPY, QQQ, ES
   * front future, EUR/USD, USD/JPY, BTC-USD, GC, CL) plus an implied-vol
   * indicator derived from SPY options when present. Movers are the largest
   * |changePct| across up to 200 tradable instruments. Regime is a heuristic
   * on the average and dispersion of those moves.
   */
  async getMarketOverview(principal: Principal): Promise<MarketOverview> {
    requirePermission(principal, "market:read");
    const now = this.clock.now();
    const universe = (await this.instruments.list({ tradable: true }, { limit: 200, offset: 0 })).items;
    const quotes = await this.quotesFor(universe);
    const byId = new Map(quotes.map((q) => [q.instrumentId, q]));

    const indicators: MarketOverview["indicators"] = [];
    for (const spec of BENCHMARKS) {
      const instrument = await this.resolveBenchmark(spec, now);
      if (!instrument) continue;
      const quote = byId.get(instrument.id) ?? (await this.brokers.get(instrument.broker).getQuote(instrument));
      indicators.push({ name: spec.name, value: quote.last, changePct: quote.changePct, unit: spec.unit });
    }
    const iv = await this.impliedVolIndicator(universe, byId);
    if (iv) indicators.push(iv);

    const movers = universe
      .map((i) => ({ instrument: i, quote: byId.get(i.id) }))
      .filter((x): x is { instrument: Instrument; quote: Quote } => x.quote !== undefined)
      .sort((a, b) => Math.abs(b.quote.changePct) - Math.abs(a.quote.changePct))
      .slice(0, 10)
      .map(({ instrument, quote }) => ({ instrumentId: instrument.id, symbol: instrument.symbol, assetClass: instrument.assetClass, last: quote.last, changePct: quote.changePct }));

    const regime = classifyRegime(quotes.map((q) => q.changePct));
    return {
      asOf: now.toISOString(),
      regime,
      headline: headlineFor(regime, indicators, movers),
      indicators,
      movers,
      eventCalendar: buildEventCalendar(now),
    };
  }

  private async quotesFor(instruments: Instrument[]): Promise<Quote[]> {
    const byBroker = new Map<BrokerKey, Instrument[]>();
    for (const i of instruments) byBroker.set(i.broker, [...(byBroker.get(i.broker) ?? []), i]);
    const out: Quote[] = [];
    for (const [broker, group] of byBroker) out.push(...(await this.brokers.get(broker).getQuotes(group)));
    return out;
  }

  private async resolveBenchmark(spec: BenchmarkSpec, now: Date): Promise<Instrument | null> {
    if (spec.kind === "symbol") return this.instruments.findBySymbol(spec.symbol);
    const futures = (await this.instruments.list({ assetClass: "future", search: spec.root }, ALL_ROWS)).items;
    return frontMonthFuture(futures, spec.root, now);
  }

  private async impliedVolIndicator(universe: Instrument[], byId: Map<string, Quote>): Promise<MarketOverview["indicators"][number] | null> {
    const spyOptions = universe.filter((i) => i.assetClass === "option" && i.details.assetClass === "option" && i.details.underlyingSymbol === "SPY");
    const ivs = spyOptions.map((i) => byId.get(i.id)?.impliedVol).filter((v): v is number => typeof v === "number" && v > 0);
    if (ivs.length === 0) return null;
    const avg = ivs.reduce((s, v) => s + v, 0) / ivs.length;
    return { name: "SPY implied vol (VIX proxy)", value: Math.round(avg * 10_000) / 100, changePct: 0, unit: "vol pts" };
  }
}
