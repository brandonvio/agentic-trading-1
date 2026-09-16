import type { Paged, PageQuery } from "@/lib/domain/common";
import type { AuditEvent, AuditFilter } from "@/lib/domain/audit";
import type { AuditRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortDesc } from "./table";

export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly table: MemoryTable<AuditEvent>) {}

  /** Newest first by `at`; `from`/`to` are inclusive bounds on `at`. */
  async list(filter: AuditFilter & { portfolioIds?: string[] }, page: PageQuery): Promise<Paged<AuditEvent>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (e) =>
        (!filter.action || e.action === filter.action) &&
        (!filter.actorId || e.actor.id === filter.actorId) &&
        (!filter.targetType || e.targetType === filter.targetType) &&
        (!filter.targetId || e.targetId === filter.targetId) &&
        (!filter.portfolioId || e.portfolioId === filter.portfolioId) &&
        (!pfSet || (e.portfolioId !== null && pfSet.has(e.portfolioId))) &&
        (!filter.from || e.at >= filter.from) &&
        (!filter.to || e.at <= filter.to),
    );
    return paginate(sortDesc(items, (e) => e.at), page);
  }

  async create(event: AuditEvent): Promise<AuditEvent> {
    return this.table.insert(event);
  }

  async createMany(events: AuditEvent[]): Promise<number> {
    for (const e of events) this.table.insert(e);
    return events.length;
  }
}
