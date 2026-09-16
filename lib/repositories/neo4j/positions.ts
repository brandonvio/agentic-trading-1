import type { PageQuery, Paged } from "@/lib/domain/common";
import type { AssetClass } from "@/lib/domain/instrument";
import { Position } from "@/lib/domain/portfolio";
import type { PositionRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Position> = {
  label: "Position",
  schema: Position,
  jsonFields: [],
  hasUpdatedAt: true,
  links: (p) => [
    relink({ label: "Position", id: p.id, rel: "IN", targetLabels: ["Portfolio"], targetId: p.portfolioId }),
    relink({ label: "Position", id: p.id, rel: "OF", targetLabels: ["Instrument"], targetId: p.instrumentId }),
    relink({ label: "Position", id: p.id, rel: "VIA", targetLabels: ["BrokerAccount"], targetId: p.brokerAccountId }),
    relink({ label: "Position", id: p.id, rel: "OWNED_BY", targetLabels: ["Strategy"], targetId: p.strategyId }),
  ],
};

export class Neo4jPositionRepository extends NodeRepository<Position> implements PositionRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Position | null> {
    return this.findNodeById(id);
  }

  async findOpen(portfolioId: string, instrumentId: string): Promise<Position | null> {
    const rows = await this.findNodes(
      new Where().eq("portfolioId", portfolioId).eq("instrumentId", instrumentId).raw("n.closedAt IS NULL"),
      "n.openedAt DESC, n.id DESC",
    );
    return rows[0] ?? null;
  }

  list(
    filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; strategyId?: string; assetClass?: AssetClass; open?: boolean },
    page: PageQuery,
  ): Promise<Paged<Position>> {
    const where = new Where()
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("instrumentId", filter.instrumentId)
      .eq("strategyId", filter.strategyId)
      .eq("assetClass", filter.assetClass)
      .when(filter.open === true, "n.closedAt IS NULL")
      .when(filter.open === false, "n.closedAt IS NOT NULL");
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(position: Position): Promise<Position> {
    return this.createNode(position);
  }

  update(id: string, patch: Partial<Omit<Position, "id" | "createdAt">>): Promise<Position> {
    return this.updateNode(id, patch);
  }
}
