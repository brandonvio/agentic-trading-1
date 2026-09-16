import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Instrument, AssetClass, BrokerKey, Bar, BarInterval } from "@/lib/domain/instrument";
import type { InstrumentRepository, BarRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortByName, sortAsc, matches, clone } from "./table";

export class InMemoryInstrumentRepository implements InstrumentRepository {
  constructor(private readonly table: MemoryTable<Instrument>) {}

  async findById(id: string): Promise<Instrument | null> {
    return this.table.get(id);
  }

  async findBySymbol(symbol: string): Promise<Instrument | null> {
    return this.table.values().find((i) => i.symbol === symbol) ?? null;
  }

  async listByIds(ids: string[]): Promise<Instrument[]> {
    const set = new Set(ids);
    return sortByName(
      this.table.values().filter((i) => set.has(i.id)),
      (i) => i.symbol,
    );
  }

  /** Sorted by symbol. `search` matches symbol or name, case-insensitive. */
  async list(
    filter: { assetClass?: AssetClass; broker?: BrokerKey; search?: string; tradable?: boolean },
    page: PageQuery,
  ): Promise<Paged<Instrument>> {
    const items = this.table.values().filter(
      (i) =>
        (!filter.assetClass || i.assetClass === filter.assetClass) &&
        (!filter.broker || i.broker === filter.broker) &&
        (filter.tradable === undefined || i.tradable === filter.tradable) &&
        (matches(i.symbol, filter.search) || matches(i.name, filter.search)),
    );
    return paginate(sortByName(items, (i) => i.symbol), page);
  }

  async create(instrument: Instrument): Promise<Instrument> {
    return this.table.insert(instrument);
  }

  async createMany(instruments: Instrument[]): Promise<number> {
    for (const i of instruments) this.table.insert(i);
    return instruments.length;
  }

  async update(id: string, patch: Partial<Omit<Instrument, "id" | "createdAt">>): Promise<Instrument> {
    return this.table.patch(id, patch);
  }
}

/** Bars are keyed by instrument + interval and de-duplicated on `time` (mirrors the Neo4j composite index). */
export class InMemoryBarRepository implements BarRepository {
  constructor(private readonly store: Map<string, Map<string, Bar>>) {}

  private key(instrumentId: string, interval: BarInterval): string {
    return `${instrumentId}|${interval}`;
  }

  /**
   * Ascending by time. `from`/`to` are inclusive bounds; `limit` keeps the
   * most recent N bars of the filtered range (still returned ascending).
   */
  async list(instrumentId: string, interval: BarInterval, opts: { from?: string; to?: string; limit?: number }): Promise<Bar[]> {
    const bucket = this.store.get(this.key(instrumentId, interval));
    if (!bucket) return [];
    let bars = sortAsc(
      [...bucket.values()].filter((b) => (!opts.from || b.time >= opts.from) && (!opts.to || b.time <= opts.to)),
      (b) => b.time,
    );
    if (opts.limit !== undefined && opts.limit >= 0 && bars.length > opts.limit) bars = bars.slice(bars.length - opts.limit);
    return bars.map(clone);
  }

  async createMany(interval: BarInterval, bars: Bar[]): Promise<number> {
    let written = 0;
    for (const bar of bars) {
      const k = this.key(bar.instrumentId, interval);
      let bucket = this.store.get(k);
      if (!bucket) {
        bucket = new Map();
        this.store.set(k, bucket);
      }
      if (!bucket.has(bar.time)) written++;
      bucket.set(bar.time, clone(bar));
    }
    return written;
  }
}
