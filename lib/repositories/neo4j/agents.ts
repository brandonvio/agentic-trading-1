import type { PageQuery, Paged } from "@/lib/domain/common";
import { Agent } from "@/lib/domain/agent";
import type { AgentRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink, relinkMany } from "./links";

const def: NodeDef<Agent> = {
  label: "Agent",
  schema: Agent,
  jsonFields: ["schedule"],
  hasUpdatedAt: true,
  links: (a) => [
    relink({ label: "Agent", id: a.id, rel: "SCOPED_TO", targetLabels: ["Portfolio"], targetId: a.portfolioId }),
    relink({ label: "Agent", id: a.id, rel: "OWNED_BY", targetLabels: ["User"], targetId: a.ownerUserId }),
    relinkMany({ label: "Agent", id: a.id, rel: "RUNS", targetLabels: ["Strategy"], targets: a.strategyIds.map((s) => ({ targetId: s })) }),
  ],
};

/**
 * Build the scope predicate for agent-like lists: the portfolio/desk filters
 * ANDed together, optionally widened with global (portfolioId IS NULL) rows.
 */
export function scopePredicate(
  where: Where,
  filter: { portfolioId?: string; portfolioIds?: string[]; deskId?: string; includeGlobal?: boolean },
): Where {
  const parts: string[] = [];
  if (filter.portfolioId !== undefined) parts.push("n.portfolioId = $portfolioId");
  if (filter.portfolioIds !== undefined) parts.push("n.portfolioId IN $portfolioIds");
  if (filter.deskId !== undefined) parts.push("n.deskId = $deskId");
  if (parts.length === 0) return where;
  const scoped = parts.join(" AND ");
  return where.raw(filter.includeGlobal ? `(${scoped}) OR n.portfolioId IS NULL` : scoped, {
    ...(filter.portfolioId !== undefined ? { portfolioId: filter.portfolioId } : {}),
    ...(filter.portfolioIds !== undefined ? { portfolioIds: [...filter.portfolioIds] } : {}),
    ...(filter.deskId !== undefined ? { deskId: filter.deskId } : {}),
  });
}

export class Neo4jAgentRepository extends NodeRepository<Agent> implements AgentRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Agent | null> {
    return this.findNodeById(id);
  }

  list(
    filter: { kind?: Agent["kind"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; status?: Agent["status"]; includeGlobal?: boolean },
    page: PageQuery,
  ): Promise<Paged<Agent>> {
    const where = scopePredicate(new Where().eq("kind", filter.kind).eq("status", filter.status), filter);
    return this.listNodes({ where, orderBy: "n.createdAt DESC, n.id DESC" }, page);
  }

  create(agent: Agent): Promise<Agent> {
    return this.createNode(agent);
  }

  update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
    return this.updateNode(id, patch);
  }
}
