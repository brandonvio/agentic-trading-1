import type { PageQuery, Paged } from "@/lib/domain/common";
import { Signal, type SignalStatus } from "@/lib/domain/agent";
import type { SignalRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Signal> = {
  label: "Signal",
  schema: Signal,
  jsonFields: ["factors"],
  hasUpdatedAt: false,
  links: (s) => [
    relink({ label: "Signal", id: s.id, rel: "ON", targetLabels: ["Instrument"], targetId: s.instrumentId }),
    relink({ label: "Signal", id: s.id, rel: "FROM_RUN", targetLabels: ["AgentRun"], targetId: s.runId }),
    relink({ label: "Signal", id: s.id, rel: "FOR", targetLabels: ["Portfolio"], targetId: s.portfolioId }),
    relink({ label: "Signal", id: s.id, rel: "FROM_STRATEGY", targetLabels: ["Strategy"], targetId: s.strategyId }),
  ],
};

export class Neo4jSignalRepository extends NodeRepository<Signal> implements SignalRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Signal | null> {
    return this.findNodeById(id);
  }

  list(
    filter: { portfolioId?: string; portfolioIds?: string[]; strategyId?: string; agentId?: string; runId?: string; instrumentId?: string; status?: SignalStatus },
    page: PageQuery,
  ): Promise<Paged<Signal>> {
    const where = new Where()
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("strategyId", filter.strategyId)
      .eq("agentId", filter.agentId)
      .eq("runId", filter.runId)
      .eq("instrumentId", filter.instrumentId)
      .eq("status", filter.status);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(signal: Signal): Promise<Signal> {
    return this.createNode(signal);
  }

  update(id: string, patch: Partial<Omit<Signal, "id" | "createdAt">>): Promise<Signal> {
    return this.updateNode(id, patch);
  }
}
