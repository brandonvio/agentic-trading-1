/**
 * AgentService: configuration, execution and observability for the firm's
 * agents. Every method enforces its permission and desk/portfolio visibility
 * itself; execution is delegated to `AgentRuntime` and the multi-agent cycle
 * to `PortfolioCycleOrchestrator`.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { Order } from "@/lib/domain/order";
import type {
  Agent,
  AgentRun,
  AgentRunTrigger,
  AgentStep,
  CreateAgentInput,
  Signal,
  UpdateAgentInput,
} from "@/lib/domain/agent";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { AgentService, AgentUsageStats } from "@/lib/services/interfaces";
import { ALL_ROWS, PortfolioScope, actorOf, assertDeskVisible, requirePermission } from "@/lib/services/authz";
import { startOfUtcDayIso } from "@/lib/services/helpers/time";
import type { ServicesAccessor } from "./services";
import type { ToolRegistry } from "./tools/registry";
import type { AgentRuntime, KillSwitch } from "./runtime";
import type { PortfolioCycleOrchestrator } from "./orchestrator";
import { AGENT_KINDS } from "./definitions";

/** Run statuses that are still in flight and can therefore be killed. */
const LIVE_RUN_STATUSES: ReadonlyArray<AgentRun["status"]> = ["queued", "running"];

export class AgentServiceImpl implements AgentService {
  constructor(
    private readonly repos: Repositories,
    private readonly scope: PortfolioScope,
    private readonly services: ServicesAccessor,
    private readonly runtime: AgentRuntime,
    private readonly orchestrator: PortfolioCycleOrchestrator,
    private readonly registry: ToolRegistry,
    private readonly killSwitch: KillSwitch,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  /** Requires agents:read plus visibility of the agent's portfolio/desk. */
  async get(principal: Principal, id: string): Promise<Agent> {
    requirePermission(principal, "agents:read");
    const agent = await this.repos.agents.findById(id);
    if (!agent) throw new NotFoundError("Agent", id);
    await this.assertVisible(principal, agent.portfolioId, agent.deskId);
    return agent;
  }

  /** Requires agents:read. Returns agents on visible portfolios plus platform-wide agents. */
  async list(
    principal: Principal,
    filter: { kind?: Agent["kind"]; portfolioId?: string; status?: Agent["status"] },
    page: PageQuery,
  ): Promise<Paged<Agent>> {
    requirePermission(principal, "agents:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.agents.list({ kind: filter.kind, status: filter.status, ...scoped, includeGlobal: true }, page);
  }

  /** Requires agents:configure. Validates the tool allow-list and the portfolio scope. */
  async create(principal: Principal, input: CreateAgentInput): Promise<Agent> {
    requirePermission(principal, "agents:configure");
    if (input.portfolioId) await this.scope.assertVisibleId(principal, input.portfolioId);
    else assertDeskVisible(principal, input.deskId);
    this.assertKnownTools(input.tools);
    const now = this.clock.nowIso();
    const agent: Agent = {
      ...input,
      id: this.ids.next(ID_PREFIX.agent),
      lastRunAt: null,
      lastRunId: null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repos.agents.create(agent);
    await this.services().audit.record({
      action: "agent.created",
      actor: actorOf(principal),
      targetType: "agent",
      targetId: created.id,
      portfolioId: created.portfolioId,
      deskId: created.deskId,
      summary: `Created ${created.kind} agent '${created.name}' (${created.autonomy})`,
      data: { kind: created.kind, autonomy: created.autonomy, model: created.model, tools: created.tools },
      ip: null,
    });
    return created;
  }

  /** Requires agents:configure and visibility of the existing agent. */
  async update(principal: Principal, id: string, input: UpdateAgentInput): Promise<Agent> {
    requirePermission(principal, "agents:configure");
    const existing = await this.repos.agents.findById(id);
    if (!existing) throw new NotFoundError("Agent", id);
    await this.assertVisible(principal, existing.portfolioId, existing.deskId);
    if (input.portfolioId) await this.scope.assertVisibleId(principal, input.portfolioId);
    if (input.tools) this.assertKnownTools(input.tools);
    const updated = await this.repos.agents.update(id, { ...input, updatedAt: this.clock.nowIso() });
    await this.services().audit.record({
      action: "agent.updated",
      actor: actorOf(principal),
      targetType: "agent",
      targetId: id,
      portfolioId: updated.portfolioId,
      deskId: updated.deskId,
      summary: `Updated agent '${updated.name}'`,
      data: { changed: Object.keys(input) },
      ip: null,
    });
    return updated;
  }

  /** Requires agents:run. Executes the agent to completion and returns the finished run. */
  async run(
    principal: Principal,
    id: string,
    opts: { objective?: string; input?: Record<string, unknown>; trigger?: AgentRunTrigger },
  ): Promise<AgentRun> {
    requirePermission(principal, "agents:run");
    const agent = await this.get(principal, id);
    if (agent.status === "disabled") throw new InvalidStateError(`Agent '${agent.name}' is disabled`, { agentId: id });
    if (agent.tools.length === 0) throw new InvalidStateError(`Agent '${agent.name}' has no tools granted`, { agentId: id });
    return this.runtime.run(agent, {
      objective: opts.objective,
      input: opts.input,
      trigger: opts.trigger ?? "manual",
      triggeredBy: actorOf(principal),
    });
  }

  /**
   * Requires agents:kill. Sets the kill switch so an in-flight run stops at
   * its next checkpoint; a run that already finished is returned unchanged.
   */
  async kill(principal: Principal, runId: string, reason: string): Promise<AgentRun> {
    requirePermission(principal, "agents:kill");
    const run = await this.loadRun(principal, runId);
    if (!LIVE_RUN_STATUSES.includes(run.status)) return run;
    this.killSwitch.request(runId);
    const killed = await this.repos.agentRuns.update(runId, {
      status: "killed",
      error: reason,
      summary: run.summary || `Run killed: ${reason}`,
      finishedAt: this.clock.nowIso(),
    });
    await this.services().audit.record({
      action: "agent.killed",
      actor: actorOf(principal),
      targetType: "agent_run",
      targetId: runId,
      portfolioId: run.portfolioId,
      deskId: null,
      summary: `Killed run ${runId} of '${run.agentName}': ${reason}`,
      data: { agentId: run.agentId, reason },
      ip: null,
    });
    this.logger.warn("agent run killed", { runId, agentId: run.agentId, reason });
    return killed;
  }

  /** Requires agents:read plus visibility of the run's portfolio. */
  async getRun(principal: Principal, runId: string): Promise<AgentRun> {
    return this.loadRun(principal, runId);
  }

  /** Requires agents:read. Newest first; includes platform-wide runs. */
  async listRuns(
    principal: Principal,
    filter: { agentId?: string; portfolioId?: string; status?: AgentRun["status"] },
    page: PageQuery,
  ): Promise<Paged<AgentRun>> {
    requirePermission(principal, "agents:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.agentRuns.list({ agentId: filter.agentId, status: filter.status, ...scoped, includeGlobal: true }, page);
  }

  /** Requires agents:read. The full ordered reasoning trace of a run. */
  async listSteps(principal: Principal, runId: string): Promise<AgentStep[]> {
    await this.loadRun(principal, runId);
    return this.repos.agentRuns.listSteps(runId);
  }

  /** Requires agents:run. Runs the full multi-agent cycle for a portfolio. */
  async runPortfolioCycle(principal: Principal, portfolioId: string): Promise<{ runs: AgentRun[]; signals: Signal[]; orders: Order[] }> {
    requirePermission(principal, "agents:run");
    return this.orchestrator.runPortfolioCycle(principal, portfolioId);
  }

  /** Requires agents:read. Aggregates every visible run into dashboard counters. */
  async usageStats(principal: Principal): Promise<AgentUsageStats> {
    requirePermission(principal, "agents:read");
    const scoped = await this.scope.filter(principal);
    const runs = (await this.repos.agentRuns.list({ ...scoped, includeGlobal: true }, ALL_ROWS)).items;
    const dayStart = startOfUtcDayIso(this.clock.now());
    const today = runs.filter((r) => r.startedAt >= dayStart);
    const succeeded = runs.filter((r) => r.status === "succeeded").length;

    const byKind = AGENT_KINDS.map((kind) => {
      const of = runs.filter((r) => r.agentKind === kind);
      return {
        kind,
        runs: of.length,
        costUsd: round(of.reduce((a, r) => a + r.costUsd, 0), 6),
        signals: of.reduce((a, r) => a + r.signalIds.length, 0),
        orders: of.reduce((a, r) => a + r.orderIds.length, 0),
      };
    }).filter((k) => k.runs > 0);

    return {
      asOf: this.clock.nowIso(),
      runsToday: today.length,
      runsTotal: runs.length,
      successRatePct: runs.length ? round((succeeded / runs.length) * 100, 2) : 0,
      inputTokens: runs.reduce((a, r) => a + r.inputTokens, 0),
      outputTokens: runs.reduce((a, r) => a + r.outputTokens, 0),
      costUsdToday: round(today.reduce((a, r) => a + r.costUsd, 0), 6),
      costUsdTotal: round(runs.reduce((a, r) => a + r.costUsd, 0), 6),
      byKind,
    };
  }

  private async loadRun(principal: Principal, runId: string): Promise<AgentRun> {
    requirePermission(principal, "agents:read");
    const run = await this.repos.agentRuns.findById(runId);
    if (!run) throw new NotFoundError("AgentRun", runId);
    await this.assertVisible(principal, run.portfolioId, null);
    return run;
  }

  /**
   * Portfolio-scoped rows require portfolio visibility; desk-scoped ones
   * require desk visibility; platform-wide rows are visible to anyone holding
   * agents:read.
   */
  private async assertVisible(principal: Principal, portfolioId: string | null, deskId: string | null): Promise<void> {
    if (portfolioId) await this.scope.assertVisibleId(principal, portfolioId);
    else if (deskId) assertDeskVisible(principal, deskId);
  }

  private assertKnownTools(tools: readonly string[]): void {
    const unknown = tools.filter((t) => !this.registry.has(t));
    if (unknown.length) throw new ValidationError(`Unknown tools: ${unknown.join(", ")}`, { unknown, available: this.registry.names() });
  }
}

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}
