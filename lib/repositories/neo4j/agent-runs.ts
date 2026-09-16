import type { PageQuery, Paged } from "@/lib/domain/common";
import { AgentRun, AgentStep, type AgentRunStatus } from "@/lib/domain/agent";
import type { AgentRunRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";
import { scopePredicate } from "./agents";

const runDef: NodeDef<AgentRun> = {
  label: "AgentRun",
  schema: AgentRun,
  jsonFields: ["triggeredBy", "input", "output"],
  hasUpdatedAt: false,
  derive: (r) => (r.triggeredBy ? { triggeredById: r.triggeredBy.id, triggeredByKind: r.triggeredBy.kind } : {}),
  links: (r) => [
    relink({ label: "AgentRun", id: r.id, rel: "BY", targetLabels: ["Agent"], targetId: r.agentId }),
    relink({ label: "AgentRun", id: r.id, rel: "FOR", targetLabels: ["Portfolio"], targetId: r.portfolioId }),
  ],
};

const stepDef: NodeDef<AgentStep> = {
  label: "AgentStep",
  schema: AgentStep,
  jsonFields: ["toolInput", "toolOutput"],
  hasUpdatedAt: false,
  links: (s) => [relink({ label: "AgentStep", id: s.id, rel: "IN", targetLabels: ["AgentRun"], targetId: s.runId, relProps: { index: s.index } })],
};

class Neo4jAgentStepStore extends NodeRepository<AgentStep> {
  constructor(ctx: RepoContext) {
    super(ctx, stepDef);
  }

  listByRun(runId: string): Promise<AgentStep[]> {
    return this.findNodes(new Where().eq("runId", runId), "n.index ASC, n.at ASC, n.id ASC");
  }

  append(step: AgentStep): Promise<AgentStep> {
    return this.createNode(step);
  }
}

export class Neo4jAgentRunRepository extends NodeRepository<AgentRun> implements AgentRunRepository {
  private readonly steps: Neo4jAgentStepStore;

  constructor(ctx: RepoContext) {
    super(ctx, runDef);
    this.steps = new Neo4jAgentStepStore(ctx);
  }

  findById(id: string): Promise<AgentRun | null> {
    return this.findNodeById(id);
  }

  list(
    filter: { agentId?: string; portfolioId?: string; portfolioIds?: string[]; status?: AgentRunStatus; includeGlobal?: boolean },
    page: PageQuery,
  ): Promise<Paged<AgentRun>> {
    const where = scopePredicate(new Where().eq("agentId", filter.agentId).eq("status", filter.status), filter);
    return this.listNodes({ where, orderBy: "n.startedAt DESC, n.id DESC" }, page);
  }

  create(run: AgentRun): Promise<AgentRun> {
    return this.createNode(run);
  }

  update(id: string, patch: Partial<Omit<AgentRun, "id">>): Promise<AgentRun> {
    return this.updateNode(id, patch);
  }

  listSteps(runId: string): Promise<AgentStep[]> {
    return this.steps.listByRun(runId);
  }

  appendStep(step: AgentStep): Promise<AgentStep> {
    return this.steps.append(step);
  }
}
