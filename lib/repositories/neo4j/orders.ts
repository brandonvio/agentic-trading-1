import type { PageQuery, Paged } from "@/lib/domain/common";
import { Order, type OrderFilter } from "@/lib/domain/order";
import type { OrderRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";
import { actorLabels } from "./labels";

const def: NodeDef<Order> = {
  label: "Order",
  schema: Order,
  jsonFields: ["createdBy", "riskChecks"],
  hasUpdatedAt: true,
  derive: (o) => (o.createdBy ? { createdById: o.createdBy.id, createdByKind: o.createdBy.kind } : {}),
  links: (o) => [
    relink({ label: "Order", id: o.id, rel: "IN", targetLabels: ["Portfolio"], targetId: o.portfolioId }),
    relink({ label: "Order", id: o.id, rel: "FOR", targetLabels: ["Instrument"], targetId: o.instrumentId }),
    relink({ label: "Order", id: o.id, rel: "VIA", targetLabels: ["BrokerAccount"], targetId: o.brokerAccountId }),
    relink({ label: "Order", id: o.id, rel: "FROM_SIGNAL", targetLabels: ["Signal"], targetId: o.signalId }),
    relink({ label: "Order", id: o.id, rel: "BY_RUN", targetLabels: ["AgentRun"], targetId: o.agentRunId }),
    relink({ label: "Order", id: o.id, rel: "CREATED_BY", targetLabels: actorLabels(o.createdBy.kind), targetId: o.createdBy.id }),
  ],
};

export class Neo4jOrderRepository extends NodeRepository<Order> implements OrderRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Order | null> {
    return this.findNodeById(id);
  }

  list(filter: OrderFilter & { portfolioIds?: string[]; createdByActorId?: string }, page: PageQuery): Promise<Paged<Order>> {
    const where = new Where()
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .eq("status", filter.status)
      .in("status", filter.statuses)
      .eq("origin", filter.origin)
      .eq("instrumentId", filter.instrumentId)
      .eq("strategyId", filter.strategyId)
      .eq("agentRunId", filter.agentRunId)
      .eq("createdById", filter.createdByActorId)
      .when(filter.deskId !== undefined, "EXISTS { MATCH (p:Portfolio) WHERE p.id = n.portfolioId AND p.deskId = $deskId }", {
        deskId: filter.deskId,
      });
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(order: Order): Promise<Order> {
    return this.createNode(order);
  }

  update(id: string, patch: Partial<Omit<Order, "id" | "createdAt">>): Promise<Order> {
    return this.updateNode(id, patch);
  }

  async sumAgentNotionalSince(portfolioId: string, sinceIso: string): Promise<number> {
    const row = await this.client.readOne<{ total: number }>(
      `MATCH (n:Order {portfolioId: $portfolioId})
       WHERE n.origin = 'agent' AND n.createdAt >= $since
       RETURN coalesce(sum(n.estimatedNotional), 0) AS total`,
      { portfolioId, since: sinceIso },
    );
    return row ? Number(row.total) : 0;
  }

  async countByStatus(portfolioId: string, statuses: Order["status"][]): Promise<number> {
    if (statuses.length === 0) return 0;
    const row = await this.client.readOne<{ total: number }>(
      `MATCH (n:Order {portfolioId: $portfolioId})
       WHERE n.status IN $statuses
       RETURN count(n) AS total`,
      { portfolioId, statuses },
    );
    return row ? Number(row.total) : 0;
  }
}
