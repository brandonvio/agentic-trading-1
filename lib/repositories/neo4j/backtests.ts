import type { PageQuery, Paged } from "@/lib/domain/common";
import { Backtest } from "@/lib/domain/strategy";
import type { BacktestRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Backtest> = {
  label: "Backtest",
  schema: Backtest,
  jsonFields: ["parameters", "stats", "equityCurve"],
  hasUpdatedAt: true,
  links: (b) => [relink({ label: "Backtest", id: b.id, rel: "OF", targetLabels: ["Strategy"], targetId: b.strategyId })],
};

export class Neo4jBacktestRepository extends NodeRepository<Backtest> implements BacktestRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Backtest | null> {
    return this.findNodeById(id);
  }

  listByStrategy(strategyId: string, page: PageQuery): Promise<Paged<Backtest>> {
    return this.listNodes({ where: new Where().eq("strategyId", strategyId), orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(backtest: Backtest): Promise<Backtest> {
    return this.createNode(backtest);
  }

  update(id: string, patch: Partial<Omit<Backtest, "id" | "createdAt">>): Promise<Backtest> {
    return this.updateNode(id, patch);
  }
}
