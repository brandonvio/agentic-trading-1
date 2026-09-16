import type { Paged, PageQuery } from "@/lib/domain/common";
import type { RiskLimit, RiskBreach, RiskBreachStatus } from "@/lib/domain/risk";
import type { RiskLimitRepository, RiskBreachRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortByName, sortDesc } from "./table";

export class InMemoryRiskLimitRepository implements RiskLimitRepository {
  constructor(private readonly table: MemoryTable<RiskLimit>) {}

  async findById(id: string): Promise<RiskLimit | null> {
    return this.table.get(id);
  }

  /** Enabled limits with platform scope, or desk/portfolio/strategy/agent scope matching the given ids. Sorted by name. */
  async listApplicable(scope: { portfolioId: string; deskId: string; strategyId?: string | null; agentId?: string | null }): Promise<RiskLimit[]> {
    const items = this.table.values().filter((l) => {
      if (!l.enabled) return false;
      switch (l.scope) {
        case "platform":
          return true;
        case "desk":
          return l.scopeId === scope.deskId;
        case "portfolio":
          return l.scopeId === scope.portfolioId;
        case "strategy":
          return Boolean(scope.strategyId) && l.scopeId === scope.strategyId;
        case "agent":
          return Boolean(scope.agentId) && l.scopeId === scope.agentId;
        default:
          return false;
      }
    });
    return sortByName(items, (l) => l.name);
  }

  /** Sorted by name. */
  async list(filter: { scope?: RiskLimit["scope"]; scopeId?: string; enabled?: boolean }, page: PageQuery): Promise<Paged<RiskLimit>> {
    const items = this.table.values().filter(
      (l) =>
        (!filter.scope || l.scope === filter.scope) &&
        (!filter.scopeId || l.scopeId === filter.scopeId) &&
        (filter.enabled === undefined || l.enabled === filter.enabled),
    );
    return paginate(sortByName(items, (l) => l.name), page);
  }

  async create(limit: RiskLimit): Promise<RiskLimit> {
    return this.table.insert(limit);
  }

  async update(id: string, patch: Partial<Omit<RiskLimit, "id" | "createdAt">>): Promise<RiskLimit> {
    return this.table.patch(id, patch);
  }

  async delete(id: string): Promise<void> {
    this.table.remove(id);
  }
}

export class InMemoryRiskBreachRepository implements RiskBreachRepository {
  constructor(private readonly table: MemoryTable<RiskBreach>) {}

  async findById(id: string): Promise<RiskBreach | null> {
    return this.table.get(id);
  }

  /** Newest first by detectedAt. */
  async list(
    filter: { portfolioId?: string; portfolioIds?: string[]; status?: RiskBreachStatus; severity?: RiskBreach["severity"]; limitId?: string },
    page: PageQuery,
  ): Promise<Paged<RiskBreach>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (b) =>
        (!filter.portfolioId || b.portfolioId === filter.portfolioId) &&
        (!pfSet || (b.portfolioId !== null && pfSet.has(b.portfolioId))) &&
        (!filter.status || b.status === filter.status) &&
        (!filter.severity || b.severity === filter.severity) &&
        (!filter.limitId || b.limitId === filter.limitId),
    );
    return paginate(sortDesc(items, (b) => b.detectedAt), page);
  }

  async create(breach: RiskBreach): Promise<RiskBreach> {
    return this.table.insert(breach);
  }

  async update(id: string, patch: Partial<Omit<RiskBreach, "id">>): Promise<RiskBreach> {
    return this.table.patch(id, patch);
  }
}
