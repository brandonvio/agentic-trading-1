import type { PageQuery, Paged } from "@/lib/domain/common";
import { AuditEvent, type AuditFilter } from "@/lib/domain/audit";
import type { AuditRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";
import { actorLabels, resolveTargetLabel } from "./labels";

const def: NodeDef<AuditEvent> = {
  label: "AuditEvent",
  schema: AuditEvent,
  jsonFields: ["actor", "data"],
  hasUpdatedAt: false,
  derive: (e) => (e.actor ? { actorId: e.actor.id, actorKind: e.actor.kind } : {}),
  links: (e) => {
    const targetLabel = resolveTargetLabel(e.targetId, e.targetType);
    return [
      relink({ label: "AuditEvent", id: e.id, rel: "ACTOR", targetLabels: actorLabels(e.actor.kind), targetId: e.actor.id }),
      relink({ label: "AuditEvent", id: e.id, rel: "TARGET", targetLabels: targetLabel ? [targetLabel] : [], targetId: e.targetId }),
      relink({ label: "AuditEvent", id: e.id, rel: "IN", targetLabels: ["Portfolio"], targetId: e.portfolioId }),
    ];
  },
};

export class Neo4jAuditRepository extends NodeRepository<AuditEvent> implements AuditRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  list(filter: AuditFilter & { portfolioIds?: string[] }, page: PageQuery): Promise<Paged<AuditEvent>> {
    const where = new Where()
      .eq("action", filter.action)
      .eq("actorId", filter.actorId)
      .eq("targetType", filter.targetType)
      .eq("targetId", filter.targetId)
      .eq("portfolioId", filter.portfolioId)
      .in("portfolioId", filter.portfolioIds)
      .gte("at", filter.from)
      .lte("at", filter.to);
    return this.listNodes({ where, orderBy: "n.at DESC, n.id DESC" }, page);
  }

  create(event: AuditEvent): Promise<AuditEvent> {
    return this.createNode(event);
  }

  createMany(events: AuditEvent[]): Promise<number> {
    return this.createNodes(events);
  }
}
