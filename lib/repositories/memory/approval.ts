import type { Paged, PageQuery } from "@/lib/domain/common";
import type { ApprovalRequest, ApprovalStatus } from "@/lib/domain/approval";
import type { ApprovalRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortDesc } from "./table";

export class InMemoryApprovalRepository implements ApprovalRepository {
  constructor(private readonly table: MemoryTable<ApprovalRequest>) {}

  async findById(id: string): Promise<ApprovalRequest | null> {
    return this.table.get(id);
  }

  async findPendingBySubject(subjectId: string): Promise<ApprovalRequest | null> {
    return this.table.valuesNewestInserted().find((a) => a.subjectId === subjectId && a.status === "pending") ?? null;
  }

  /** Newest first by createdAt. */
  async list(
    filter: { status?: ApprovalStatus; type?: ApprovalRequest["type"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; requestedById?: string },
    page: PageQuery,
  ): Promise<Paged<ApprovalRequest>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (a) =>
        (!filter.status || a.status === filter.status) &&
        (!filter.type || a.type === filter.type) &&
        (!filter.portfolioId || a.portfolioId === filter.portfolioId) &&
        (!pfSet || (a.portfolioId !== null && pfSet.has(a.portfolioId))) &&
        (!filter.deskId || a.deskId === filter.deskId) &&
        (!filter.requestedById || a.requestedBy.id === filter.requestedById),
    );
    return paginate(sortDesc(items, (a) => a.createdAt), page);
  }

  async create(approval: ApprovalRequest): Promise<ApprovalRequest> {
    return this.table.insert(approval);
  }

  async update(id: string, patch: Partial<Omit<ApprovalRequest, "id" | "createdAt">>): Promise<ApprovalRequest> {
    return this.table.patch(id, patch);
  }
}
