import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Order, OrderFilter, Fill } from "@/lib/domain/order";
import type { Portfolio } from "@/lib/domain/portfolio";
import type { OrderRepository, FillRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortDesc } from "./table";

export class InMemoryOrderRepository implements OrderRepository {
  constructor(
    private readonly table: MemoryTable<Order>,
    /** Needed to resolve the `deskId` filter (orders carry no desk id; Neo4j joins via the portfolio). */
    private readonly portfolios: MemoryTable<Portfolio>,
  ) {}

  async findById(id: string): Promise<Order | null> {
    return this.table.get(id);
  }

  /** Newest first by createdAt. */
  async list(filter: OrderFilter & { portfolioIds?: string[]; createdByActorId?: string }, page: PageQuery): Promise<Paged<Order>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const statusSet = filter.statuses ? new Set(filter.statuses) : null;
    const deskPortfolios = filter.deskId
      ? new Set(
          this.portfolios
            .values()
            .filter((p) => p.deskId === filter.deskId)
            .map((p) => p.id),
        )
      : null;
    const items = this.table.valuesNewestInserted().filter(
      (o) =>
        (!filter.portfolioId || o.portfolioId === filter.portfolioId) &&
        (!pfSet || pfSet.has(o.portfolioId)) &&
        (!deskPortfolios || deskPortfolios.has(o.portfolioId)) &&
        (!filter.status || o.status === filter.status) &&
        (!statusSet || statusSet.has(o.status)) &&
        (!filter.origin || o.origin === filter.origin) &&
        (!filter.instrumentId || o.instrumentId === filter.instrumentId) &&
        (!filter.strategyId || o.strategyId === filter.strategyId) &&
        (!filter.agentRunId || o.agentRunId === filter.agentRunId) &&
        (!filter.createdByActorId || o.createdBy.id === filter.createdByActorId),
    );
    return paginate(sortDesc(items, (o) => o.createdAt), page);
  }

  async create(order: Order): Promise<Order> {
    return this.table.insert(order);
  }

  async update(id: string, patch: Partial<Omit<Order, "id" | "createdAt">>): Promise<Order> {
    return this.table.patch(id, patch);
  }

  async sumAgentNotionalSince(portfolioId: string, sinceIso: string): Promise<number> {
    return this.table
      .values()
      .filter((o) => o.portfolioId === portfolioId && o.origin === "agent" && o.createdAt >= sinceIso)
      .reduce((sum, o) => sum + o.estimatedNotional, 0);
  }

  async countByStatus(portfolioId: string, statuses: Order["status"][]): Promise<number> {
    const set = new Set(statuses);
    return this.table.values().filter((o) => o.portfolioId === portfolioId && set.has(o.status)).length;
  }
}

export class InMemoryFillRepository implements FillRepository {
  constructor(private readonly table: MemoryTable<Fill>) {}

  /** Newest first by executedAt. */
  async listByOrder(orderId: string): Promise<Fill[]> {
    return sortDesc(
      this.table.valuesNewestInserted().filter((f) => f.orderId === orderId),
      (f) => f.executedAt,
    );
  }

  /** Newest first by executedAt; `from`/`to` are inclusive bounds on executedAt. */
  async list(
    filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; from?: string; to?: string },
    page: PageQuery,
  ): Promise<Paged<Fill>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (f) =>
        (!filter.portfolioId || f.portfolioId === filter.portfolioId) &&
        (!pfSet || pfSet.has(f.portfolioId)) &&
        (!filter.instrumentId || f.instrumentId === filter.instrumentId) &&
        (!filter.from || f.executedAt >= filter.from) &&
        (!filter.to || f.executedAt <= filter.to),
    );
    return paginate(sortDesc(items, (f) => f.executedAt), page);
  }

  async create(fill: Fill): Promise<Fill> {
    return this.table.insert(fill);
  }
}
