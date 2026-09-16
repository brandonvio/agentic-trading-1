import type { PageQuery, Paged } from "@/lib/domain/common";
import { RiskBreach, type RiskBreachStatus } from "@/lib/domain/risk";
import type { RiskBreachRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<RiskBreach> = {
  label: "RiskBreach",
  schema: RiskBreach,
  jsonFields: ["detectedBy"],
  hasUpdatedAt: false,
  derive: (b) => (b.detectedBy ? { detectedById: b.detectedBy.id, detectedByKind: b.detectedBy.kind } : {}),
  links: (b) => [
    relink({ label: "RiskBreach", id: b.id, rel: "OF", targetLabels: ["RiskLimit"], targetId: b.limitId }),
    relink({ label: "RiskBreach", id: b.id, rel: "IN", targetLabels: ["Portfolio"], targetId: b.portfolioId }),
  ],
};

export class Neo4jRiskBreachRepository extends NodeRepository<RiskBreach> implements RiskBreachRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<RiskBreach | null> {
    return this.findNodeById(id);
  }

  list(
    filter: { portfolioId?: string; portfolioIds?: string[]; status?: RiskBreachStatus; severity?: RiskBreach["severity"]; limitId?: string },
    page: PageQuery,
  ): Promise<Paged<RiskBreach>> {
    const where = new Where()
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("status", filter.status)
      .eq("severity", filter.severity)
      .eq("limitId", filter.limitId);
    return this.listNodes({ where, orderBy: "n.detectedAt DESC, n.id DESC" }, page);
  }

  create(breach: RiskBreach): Promise<RiskBreach> {
    return this.createNode(breach);
  }

  update(id: string, patch: Partial<Omit<RiskBreach, "id">>): Promise<RiskBreach> {
    return this.updateNode(id, patch);
  }
}
