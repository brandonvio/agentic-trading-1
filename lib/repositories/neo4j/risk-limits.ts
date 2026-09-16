import type { PageQuery, Paged } from "@/lib/domain/common";
import { RiskLimit } from "@/lib/domain/risk";
import type { RiskLimitRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const SCOPE_LABEL: Record<RiskLimit["scope"], string[]> = {
  platform: [],
  desk: ["Desk"],
  portfolio: ["Portfolio"],
  strategy: ["Strategy"],
  agent: ["Agent"],
};

const def: NodeDef<RiskLimit> = {
  label: "RiskLimit",
  schema: RiskLimit,
  jsonFields: [],
  hasUpdatedAt: true,
  links: (l) => [relink({ label: "RiskLimit", id: l.id, rel: "APPLIES_TO", targetLabels: SCOPE_LABEL[l.scope], targetId: l.scopeId })],
};

export class Neo4jRiskLimitRepository extends NodeRepository<RiskLimit> implements RiskLimitRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<RiskLimit | null> {
    return this.findNodeById(id);
  }

  listApplicable(scope: { portfolioId: string; deskId: string; strategyId?: string | null; agentId?: string | null }): Promise<RiskLimit[]> {
    const where = new Where().eq("enabled", true).raw(
      `n.scope = 'platform'
       OR (n.scope = 'desk' AND n.scopeId = $deskId)
       OR (n.scope = 'portfolio' AND n.scopeId = $portfolioId)
       OR ($strategyId IS NOT NULL AND n.scope = 'strategy' AND n.scopeId = $strategyId)
       OR ($agentId IS NOT NULL AND n.scope = 'agent' AND n.scopeId = $agentId)`,
      { deskId: scope.deskId, portfolioId: scope.portfolioId, strategyId: scope.strategyId ?? null, agentId: scope.agentId ?? null },
    );
    return this.findNodes(where, "n.scope ASC, n.createdAt ASC, n.id ASC");
  }

  list(filter: { scope?: RiskLimit["scope"]; scopeId?: string; enabled?: boolean }, page: PageQuery): Promise<Paged<RiskLimit>> {
    const where = new Where().eq("scope", filter.scope).eq("scopeId", filter.scopeId).eq("enabled", filter.enabled);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(limit: RiskLimit): Promise<RiskLimit> {
    return this.createNode(limit);
  }

  update(id: string, patch: Partial<Omit<RiskLimit, "id" | "createdAt">>): Promise<RiskLimit> {
    return this.updateNode(id, patch);
  }

  delete(id: string): Promise<void> {
    return this.deleteNode(id);
  }
}
