import type { PageQuery, Paged } from "@/lib/domain/common";
import { Portfolio } from "@/lib/domain/portfolio";
import type { PortfolioRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Portfolio> = {
  label: "Portfolio",
  schema: Portfolio,
  jsonFields: ["mandate"],
  hasUpdatedAt: true,
  links: (p) => [
    relink({ label: "Portfolio", id: p.id, rel: "BELONGS_TO", targetLabels: ["Desk"], targetId: p.deskId }),
    relink({ label: "Portfolio", id: p.id, rel: "MANAGED_BY", targetLabels: ["User"], targetId: p.managerUserId }),
  ],
};

export class Neo4jPortfolioRepository extends NodeRepository<Portfolio> implements PortfolioRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Portfolio | null> {
    return this.findNodeById(id);
  }

  findByCode(code: string): Promise<Portfolio | null> {
    return this.findNodeBy("code", code);
  }

  list(
    filter: { deskId?: string; deskIds?: string[]; status?: Portfolio["status"]; managerUserId?: string },
    page: PageQuery,
  ): Promise<Paged<Portfolio>> {
    const where = new Where()
      .eq("deskId", filter.deskId)
      .in("deskId", filter.deskIds)
      .eq("status", filter.status)
      .eq("managerUserId", filter.managerUserId);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(portfolio: Portfolio): Promise<Portfolio> {
    return this.createNode(portfolio);
  }

  update(id: string, patch: Partial<Omit<Portfolio, "id" | "createdAt">>): Promise<Portfolio> {
    return this.updateNode(id, patch);
  }
}
