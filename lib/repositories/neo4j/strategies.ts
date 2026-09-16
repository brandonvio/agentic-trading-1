import type { PageQuery, Paged } from "@/lib/domain/common";
import { Strategy } from "@/lib/domain/strategy";
import type { StrategyRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink, relinkMany } from "./links";

const def: NodeDef<Strategy> = {
  label: "Strategy",
  schema: Strategy,
  jsonFields: ["deployments", "parameters", "backtest", "live"],
  hasUpdatedAt: true,
  // Denormalised list of deployed portfolio ids so list filters stay index-friendly.
  derive: (s) => (s.deployments ? { deployedPortfolioIds: s.deployments.map((d) => d.portfolioId) } : {}),
  links: (s) => [
    relink({ label: "Strategy", id: s.id, rel: "OWNED_BY", targetLabels: ["User"], targetId: s.ownerUserId }),
    relink({ label: "Strategy", id: s.id, rel: "ON_DESK", targetLabels: ["Desk"], targetId: s.deskId }),
    relinkMany({
      label: "Strategy",
      id: s.id,
      rel: "DEPLOYED_TO",
      targetLabels: ["Portfolio"],
      targets: s.deployments.map((d) => ({ targetId: d.portfolioId, props: { allocatedCapital: d.allocatedCapital, deployedAt: d.deployedAt } })),
    }),
    relinkMany({ label: "Strategy", id: s.id, rel: "TRADES", targetLabels: ["Instrument"], targets: s.instrumentIds.map((i) => ({ targetId: i })) }),
  ],
};

export class Neo4jStrategyRepository extends NodeRepository<Strategy> implements StrategyRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Strategy | null> {
    return this.findNodeById(id);
  }

  findByCode(code: string): Promise<Strategy | null> {
    return this.findNodeBy("code", code);
  }

  list(
    filter: { deskId?: string; deskIds?: string[]; status?: Strategy["status"]; portfolioId?: string; ownerUserId?: string },
    page: PageQuery,
  ): Promise<Paged<Strategy>> {
    const where = new Where()
      .eq("deskId", filter.deskId)
      .in("deskId", filter.deskIds)
      .eq("status", filter.status)
      .eq("ownerUserId", filter.ownerUserId)
      .when(filter.portfolioId !== undefined, "$portfolioId IN coalesce(n.deployedPortfolioIds, [])", { portfolioId: filter.portfolioId });
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(strategy: Strategy): Promise<Strategy> {
    return this.createNode(strategy);
  }

  update(id: string, patch: Partial<Omit<Strategy, "id" | "createdAt">>): Promise<Strategy> {
    return this.updateNode(id, patch);
  }
}
