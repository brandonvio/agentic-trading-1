import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Strategy, Backtest } from "@/lib/domain/strategy";
import type { StrategyRepository, BacktestRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortByName, sortDesc } from "./table";

export class InMemoryStrategyRepository implements StrategyRepository {
  constructor(private readonly table: MemoryTable<Strategy>) {}

  async findById(id: string): Promise<Strategy | null> {
    return this.table.get(id);
  }

  async findByCode(code: string): Promise<Strategy | null> {
    return this.table.values().find((s) => s.code === code) ?? null;
  }

  /** Sorted by name. `portfolioId` matches strategies deployed to that portfolio. */
  async list(
    filter: { deskId?: string; deskIds?: string[]; status?: Strategy["status"]; portfolioId?: string; ownerUserId?: string },
    page: PageQuery,
  ): Promise<Paged<Strategy>> {
    const deskSet = filter.deskIds ? new Set(filter.deskIds) : null;
    const items = this.table.values().filter(
      (s) =>
        (!filter.deskId || s.deskId === filter.deskId) &&
        (!deskSet || deskSet.has(s.deskId)) &&
        (!filter.status || s.status === filter.status) &&
        (!filter.portfolioId || s.deployments.some((d) => d.portfolioId === filter.portfolioId)) &&
        (!filter.ownerUserId || s.ownerUserId === filter.ownerUserId),
    );
    return paginate(sortByName(items, (s) => s.name), page);
  }

  async create(strategy: Strategy): Promise<Strategy> {
    return this.table.insert(strategy);
  }

  async update(id: string, patch: Partial<Omit<Strategy, "id" | "createdAt">>): Promise<Strategy> {
    return this.table.patch(id, patch);
  }
}

export class InMemoryBacktestRepository implements BacktestRepository {
  constructor(private readonly table: MemoryTable<Backtest>) {}

  async findById(id: string): Promise<Backtest | null> {
    return this.table.get(id);
  }

  /** Newest first by createdAt. */
  async listByStrategy(strategyId: string, page: PageQuery): Promise<Paged<Backtest>> {
    const items = this.table.valuesNewestInserted().filter((b) => b.strategyId === strategyId);
    return paginate(sortDesc(items, (b) => b.createdAt), page);
  }

  async create(backtest: Backtest): Promise<Backtest> {
    return this.table.insert(backtest);
  }

  async update(id: string, patch: Partial<Omit<Backtest, "id" | "createdAt">>): Promise<Backtest> {
    return this.table.patch(id, patch);
  }
}
