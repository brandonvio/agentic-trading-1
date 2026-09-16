import type { Paged, PageQuery } from "@/lib/domain/common";
import type { AssetClass, BrokerKey } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount, Position } from "@/lib/domain/portfolio";
import type { PortfolioRepository, BrokerAccountRepository, PositionRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortByName, sortDesc } from "./table";

export class InMemoryPortfolioRepository implements PortfolioRepository {
  constructor(private readonly table: MemoryTable<Portfolio>) {}

  async findById(id: string): Promise<Portfolio | null> {
    return this.table.get(id);
  }

  async findByCode(code: string): Promise<Portfolio | null> {
    return this.table.values().find((p) => p.code === code) ?? null;
  }

  /** Sorted by name. `deskIds` (when given) restricts to those desks even if empty. */
  async list(
    filter: { deskId?: string; deskIds?: string[]; status?: Portfolio["status"]; managerUserId?: string },
    page: PageQuery,
  ): Promise<Paged<Portfolio>> {
    const deskSet = filter.deskIds ? new Set(filter.deskIds) : null;
    const items = this.table.values().filter(
      (p) =>
        (!filter.deskId || p.deskId === filter.deskId) &&
        (!deskSet || deskSet.has(p.deskId)) &&
        (!filter.status || p.status === filter.status) &&
        (!filter.managerUserId || p.managerUserId === filter.managerUserId),
    );
    return paginate(sortByName(items, (p) => p.name), page);
  }

  async create(portfolio: Portfolio): Promise<Portfolio> {
    return this.table.insert(portfolio);
  }

  async update(id: string, patch: Partial<Omit<Portfolio, "id" | "createdAt">>): Promise<Portfolio> {
    return this.table.patch(id, patch);
  }
}

export class InMemoryBrokerAccountRepository implements BrokerAccountRepository {
  constructor(private readonly table: MemoryTable<BrokerAccount>) {}

  async findById(id: string): Promise<BrokerAccount | null> {
    return this.table.get(id);
  }

  async findByPortfolioAndBroker(portfolioId: string, broker: BrokerKey): Promise<BrokerAccount | null> {
    return this.table.values().find((a) => a.portfolioId === portfolioId && a.broker === broker) ?? null;
  }

  /** Sorted by label. */
  async list(filter: { portfolioId?: string; broker?: BrokerKey; status?: BrokerAccount["status"] }, page: PageQuery): Promise<Paged<BrokerAccount>> {
    const items = this.table.values().filter(
      (a) =>
        (!filter.portfolioId || a.portfolioId === filter.portfolioId) &&
        (!filter.broker || a.broker === filter.broker) &&
        (!filter.status || a.status === filter.status),
    );
    return paginate(sortByName(items, (a) => a.label), page);
  }

  async create(account: BrokerAccount): Promise<BrokerAccount> {
    return this.table.insert(account);
  }

  async update(id: string, patch: Partial<Omit<BrokerAccount, "id" | "createdAt">>): Promise<BrokerAccount> {
    return this.table.patch(id, patch);
  }
}

export class InMemoryPositionRepository implements PositionRepository {
  constructor(private readonly table: MemoryTable<Position>) {}

  async findById(id: string): Promise<Position | null> {
    return this.table.get(id);
  }

  async findOpen(portfolioId: string, instrumentId: string): Promise<Position | null> {
    return (
      this.table.valuesNewestInserted().find((p) => p.portfolioId === portfolioId && p.instrumentId === instrumentId && p.closedAt === null) ?? null
    );
  }

  /** Newest first by openedAt. */
  async list(
    filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; strategyId?: string; assetClass?: AssetClass; open?: boolean },
    page: PageQuery,
  ): Promise<Paged<Position>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (p) =>
        (!filter.portfolioId || p.portfolioId === filter.portfolioId) &&
        (!pfSet || pfSet.has(p.portfolioId)) &&
        (!filter.instrumentId || p.instrumentId === filter.instrumentId) &&
        (!filter.strategyId || p.strategyId === filter.strategyId) &&
        (!filter.assetClass || p.assetClass === filter.assetClass) &&
        (filter.open === undefined || (filter.open ? p.closedAt === null : p.closedAt !== null)),
    );
    return paginate(sortDesc(items, (p) => p.openedAt), page);
  }

  async create(position: Position): Promise<Position> {
    return this.table.insert(position);
  }

  async update(id: string, patch: Partial<Omit<Position, "id" | "createdAt">>): Promise<Position> {
    return this.table.patch(id, patch);
  }
}
