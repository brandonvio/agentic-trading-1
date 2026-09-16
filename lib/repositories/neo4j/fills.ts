import type { PageQuery, Paged } from "@/lib/domain/common";
import { Fill } from "@/lib/domain/order";
import type { FillRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Fill> = {
  label: "Fill",
  schema: Fill,
  jsonFields: [],
  hasUpdatedAt: false,
  links: (f) => [relink({ label: "Fill", id: f.id, rel: "FILLS", targetLabels: ["Order"], targetId: f.orderId })],
};

export class Neo4jFillRepository extends NodeRepository<Fill> implements FillRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  listByOrder(orderId: string): Promise<Fill[]> {
    return this.findNodes(new Where().eq("orderId", orderId), "n.executedAt ASC, n.id ASC");
  }

  list(
    filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; from?: string; to?: string },
    page: PageQuery,
  ): Promise<Paged<Fill>> {
    const where = new Where()
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("instrumentId", filter.instrumentId)
      .gte("executedAt", filter.from)
      .lte("executedAt", filter.to);
    return this.listNodes({ where, orderBy: "n.executedAt DESC, n.id DESC" }, page);
  }

  create(fill: Fill): Promise<Fill> {
    return this.createNode(fill);
  }
}
