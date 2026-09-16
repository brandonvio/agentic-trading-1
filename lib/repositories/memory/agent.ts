import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Agent, AgentRun, AgentStep, Signal, AgentRunStatus, SignalStatus } from "@/lib/domain/agent";
import type { AgentRepository, AgentRunRepository, SignalRepository } from "@/lib/repositories/interfaces";
import { NotFoundError } from "@/lib/core/errors";
import { MemoryTable, paginate, sortByName, sortDesc, clone } from "./table";

export class InMemoryAgentRepository implements AgentRepository {
  constructor(private readonly table: MemoryTable<Agent>) {}

  async findById(id: string): Promise<Agent | null> {
    return this.table.get(id);
  }

  /**
   * Sorted by name. `portfolioId`/`portfolioIds` restrict to agents scoped to
   * those portfolios; `includeGlobal` additionally returns agents with a null
   * portfolio scope.
   */
  async list(
    filter: { kind?: Agent["kind"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; status?: Agent["status"]; includeGlobal?: boolean },
    page: PageQuery,
  ): Promise<Paged<Agent>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const scoped = (a: Agent): boolean => {
      const inScope = (!filter.portfolioId || a.portfolioId === filter.portfolioId) && (!pfSet || (a.portfolioId !== null && pfSet.has(a.portfolioId)));
      const hasScopeFilter = Boolean(filter.portfolioId) || pfSet !== null;
      return inScope || (hasScopeFilter && filter.includeGlobal === true && a.portfolioId === null);
    };
    const items = this.table.values().filter(
      (a) =>
        (!filter.kind || a.kind === filter.kind) &&
        (!filter.deskId || a.deskId === filter.deskId) &&
        (!filter.status || a.status === filter.status) &&
        scoped(a),
    );
    return paginate(sortByName(items, (a) => a.name), page);
  }

  async create(agent: Agent): Promise<Agent> {
    return this.table.insert(agent);
  }

  async update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
    return this.table.patch(id, patch);
  }
}

export class InMemoryAgentRunRepository implements AgentRunRepository {
  constructor(
    private readonly table: MemoryTable<AgentRun>,
    private readonly steps: Map<string, AgentStep[]>,
  ) {}

  async findById(id: string): Promise<AgentRun | null> {
    return this.table.get(id);
  }

  /** Newest first by startedAt. See AgentRepository.list for `includeGlobal` semantics. */
  async list(
    filter: { agentId?: string; portfolioId?: string; portfolioIds?: string[]; status?: AgentRunStatus; includeGlobal?: boolean },
    page: PageQuery,
  ): Promise<Paged<AgentRun>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const scoped = (r: AgentRun): boolean => {
      const inScope = (!filter.portfolioId || r.portfolioId === filter.portfolioId) && (!pfSet || (r.portfolioId !== null && pfSet.has(r.portfolioId)));
      const hasScopeFilter = Boolean(filter.portfolioId) || pfSet !== null;
      return inScope || (hasScopeFilter && filter.includeGlobal === true && r.portfolioId === null);
    };
    const items = this.table
      .valuesNewestInserted()
      .filter((r) => (!filter.agentId || r.agentId === filter.agentId) && (!filter.status || r.status === filter.status) && scoped(r));
    return paginate(sortDesc(items, (r) => r.startedAt), page);
  }

  async create(run: AgentRun): Promise<AgentRun> {
    return this.table.insert(run);
  }

  async update(id: string, patch: Partial<Omit<AgentRun, "id">>): Promise<AgentRun> {
    return this.table.patch(id, patch);
  }

  /** Ascending by step index. */
  async listSteps(runId: string): Promise<AgentStep[]> {
    return [...(this.steps.get(runId) ?? [])].sort((a, b) => a.index - b.index).map(clone);
  }

  async appendStep(step: AgentStep): Promise<AgentStep> {
    if (!this.table.has(step.runId)) throw new NotFoundError("AgentRun", step.runId);
    const list = this.steps.get(step.runId) ?? [];
    list.push(clone(step));
    this.steps.set(step.runId, list);
    return clone(step);
  }
}

export class InMemorySignalRepository implements SignalRepository {
  constructor(private readonly table: MemoryTable<Signal>) {}

  async findById(id: string): Promise<Signal | null> {
    return this.table.get(id);
  }

  /** Newest first by createdAt. */
  async list(
    filter: { portfolioId?: string; portfolioIds?: string[]; strategyId?: string; agentId?: string; runId?: string; instrumentId?: string; status?: SignalStatus },
    page: PageQuery,
  ): Promise<Paged<Signal>> {
    const pfSet = filter.portfolioIds ? new Set(filter.portfolioIds) : null;
    const items = this.table.valuesNewestInserted().filter(
      (s) =>
        (!filter.portfolioId || s.portfolioId === filter.portfolioId) &&
        (!pfSet || (s.portfolioId !== null && pfSet.has(s.portfolioId))) &&
        (!filter.strategyId || s.strategyId === filter.strategyId) &&
        (!filter.agentId || s.agentId === filter.agentId) &&
        (!filter.runId || s.runId === filter.runId) &&
        (!filter.instrumentId || s.instrumentId === filter.instrumentId) &&
        (!filter.status || s.status === filter.status),
    );
    return paginate(sortDesc(items, (s) => s.createdAt), page);
  }

  async create(signal: Signal): Promise<Signal> {
    return this.table.insert(signal);
  }

  async update(id: string, patch: Partial<Omit<Signal, "id" | "createdAt">>): Promise<Signal> {
    return this.table.patch(id, patch);
  }
}
