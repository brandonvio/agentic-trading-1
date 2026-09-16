import type { PageQuery, Paged } from "@/lib/domain/common";
import { ApprovalRequest, type ApprovalStatus } from "@/lib/domain/approval";
import type { ApprovalRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";
import { actorLabels, labelForId } from "./labels";

/** Fallback subject label by approval type when the id prefix is not recognised. */
const TYPE_SUBJECT_LABEL: Record<ApprovalRequest["type"], string> = {
  order: "Order",
  strategy_deploy: "Strategy",
  risk_limit_change: "RiskLimit",
  agent_autonomy_change: "Agent",
  risk_override: "Order",
};

const def: NodeDef<ApprovalRequest> = {
  label: "ApprovalRequest",
  schema: ApprovalRequest,
  jsonFields: ["requestedBy"],
  hasUpdatedAt: false,
  derive: (a) => (a.requestedBy ? { requestedById: a.requestedBy.id, requestedByKind: a.requestedBy.kind } : {}),
  links: (a) => [
    relink({
      label: "ApprovalRequest",
      id: a.id,
      rel: "SUBJECT",
      targetLabels: [labelForId(a.subjectId) ?? TYPE_SUBJECT_LABEL[a.type]],
      targetId: a.subjectId,
    }),
    relink({ label: "ApprovalRequest", id: a.id, rel: "REQUESTED_BY", targetLabels: actorLabels(a.requestedBy.kind), targetId: a.requestedBy.id }),
    relink({ label: "ApprovalRequest", id: a.id, rel: "DECIDED_BY", targetLabels: ["User"], targetId: a.decidedByUserId }),
  ],
};

export class Neo4jApprovalRepository extends NodeRepository<ApprovalRequest> implements ApprovalRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<ApprovalRequest | null> {
    return this.findNodeById(id);
  }

  async findPendingBySubject(subjectId: string): Promise<ApprovalRequest | null> {
    const rows = await this.findNodes(new Where().eq("subjectId", subjectId).eq("status", "pending"), "n.createdAt DESC, n.id DESC");
    return rows[0] ?? null;
  }

  list(
    filter: { status?: ApprovalStatus; type?: ApprovalRequest["type"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; requestedById?: string },
    page: PageQuery,
  ): Promise<Paged<ApprovalRequest>> {
    const where = new Where()
      .eq("status", filter.status)
      .eq("type", filter.type)
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("deskId", filter.deskId)
      .eq("requestedById", filter.requestedById);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(approval: ApprovalRequest): Promise<ApprovalRequest> {
    return this.createNode(approval);
  }

  update(id: string, patch: Partial<Omit<ApprovalRequest, "id" | "createdAt">>): Promise<ApprovalRequest> {
    return this.updateNode(id, patch);
  }
}
