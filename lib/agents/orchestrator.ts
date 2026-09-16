/**
 * The portfolio cycle: the firm's agents run as one pipeline, each stage
 * consuming the previous stage's structured output.
 *
 *   market intelligence → signal generation → portfolio manager (sizing)
 *   → execution → risk sentinel → compliance
 *
 * Stages with no configured agent are skipped rather than failing: a desk that
 * has not deployed an execution agent still gets intel, signals, sizing and a
 * risk sweep.
 */
import type { Agent, AgentKind, AgentRun, Signal } from "@/lib/domain/agent";
import type { Order } from "@/lib/domain/order";
import type { Principal } from "@/lib/domain/auth";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Logger } from "@/lib/core/logger";
import { ALL_ROWS, PortfolioScope, actorOf, requirePermission } from "@/lib/services/authz";
import { isRecord } from "@/lib/llm/json";
import type { ServicesAccessor } from "./services";
import type { AgentRuntime } from "./runtime";

export interface PortfolioCycleResult {
  runs: AgentRun[];
  signals: Signal[];
  orders: Order[];
}

/** Agent statuses that may be scheduled into a cycle. */
const RUNNABLE: ReadonlyArray<Agent["status"]> = ["idle", "running", "error"];

export class PortfolioCycleOrchestrator {
  constructor(
    private readonly repos: Repositories,
    private readonly scope: PortfolioScope,
    private readonly services: ServicesAccessor,
    private readonly runtime: AgentRuntime,
    private readonly logger: Logger,
  ) {}

  /**
   * Run the full cycle for one portfolio. Requires `agents:run` and portfolio
   * visibility; every stage is triggered as `orchestrator`.
   */
  async runPortfolioCycle(principal: Principal, portfolioId: string): Promise<PortfolioCycleResult> {
    requirePermission(principal, "agents:run");
    const portfolio = await this.scope.load(principal, portfolioId);
    const agents = await this.candidates(portfolioId);
    const triggeredBy = actorOf(principal);
    const runs: AgentRun[] = [];

    const execute = async (agent: Agent, input: Record<string, unknown>): Promise<AgentRun> => {
      const run = await this.runtime.run(agent, { input, trigger: "orchestrator", triggeredBy });
      runs.push(run);
      if (run.status !== "succeeded") {
        this.logger.warn("orchestrator stage did not succeed", { agentId: agent.id, kind: agent.kind, runId: run.id, status: run.status });
      }
      return run;
    };

    const base: Record<string, unknown> = { portfolioId, portfolioCode: portfolio.code, baseCurrency: portfolio.baseCurrency };

    // 1. Market intelligence — the view everything else reasons from.
    const intel = agents.market_intelligence;
    const marketView = intel ? (await execute(intel, { ...base })).output : null;

    // 2. Signal generation — every configured generator, in name order.
    const candidateSignals: Signal[] = [];
    for (const agent of agents.signal_generation) {
      const run = await execute(agent, {
        ...base,
        marketView,
        strategyId: agent.strategyIds[0],
        strategyIds: agent.strategyIds,
      });
      for (const id of run.signalIds) {
        const signal = await this.repos.signals.findById(id);
        if (signal) candidateSignals.push(signal);
      }
    }

    // 3. Portfolio manager — sizes the candidates against the risk budget.
    const pm = agents.portfolio_manager;
    const pmOutput = pm ? (await execute(pm, { ...base, marketView, signals: candidateSignals })).output : null;
    const decisions = arrayOf(pmOutput?.decisions);

    // 4. Execution — works the approved decisions into orders.
    const exec = agents.execution;
    const execOutput = exec ? (await execute(exec, { ...base, marketView, decisions })).output : null;

    // 5. Risk sentinel — a fresh limit scan, then hedge proposals.
    const sentinel = agents.risk_sentinel;
    let riskOutput: Record<string, unknown> | null = null;
    if (sentinel) {
      const breaches = await this.services().risk.scanPortfolio(portfolioId, { kind: "agent", id: sentinel.id, name: sentinel.name });
      riskOutput = (await execute(sentinel, { ...base, marketView, breaches, decisions })).output;
    }

    // 6. Compliance — reviews what the cycle just did.
    const compliance = agents.compliance;
    if (compliance) {
      await execute(compliance, {
        ...base,
        decisions,
        executions: arrayOf(execOutput?.executions),
        riskFindings: arrayOf(riskOutput?.issues),
      });
    }

    return { runs, signals: await this.collectSignals(runs), orders: await this.collectOrders(runs) };
  }

  /** Agents eligible for this portfolio, grouped by stage; globals included. */
  private async candidates(portfolioId: string): Promise<StageAgents> {
    const page = await this.repos.agents.list({ portfolioId, includeGlobal: true }, ALL_ROWS);
    const eligible = page.items.filter((a) => RUNNABLE.includes(a.status) && a.tools.length > 0);
    const pick = (kind: AgentKind): Agent | null => {
      const of = eligible.filter((a) => a.kind === kind);
      // Portfolio-scoped agents take precedence over platform-wide ones.
      return of.find((a) => a.portfolioId === portfolioId) ?? of[0] ?? null;
    };
    return {
      market_intelligence: pick("market_intelligence"),
      signal_generation: eligible.filter((a) => a.kind === "signal_generation"),
      portfolio_manager: pick("portfolio_manager"),
      execution: pick("execution"),
      risk_sentinel: pick("risk_sentinel"),
      compliance: pick("compliance"),
    };
  }

  private async collectSignals(runs: readonly AgentRun[]): Promise<Signal[]> {
    const out: Signal[] = [];
    for (const id of unique(runs.flatMap((r) => r.signalIds))) {
      const signal = await this.repos.signals.findById(id);
      if (signal) out.push(signal);
    }
    return out;
  }

  private async collectOrders(runs: readonly AgentRun[]): Promise<Order[]> {
    const out: Order[] = [];
    for (const id of unique(runs.flatMap((r) => r.orderIds))) {
      const order = await this.repos.orders.findById(id);
      if (order) out.push(order);
    }
    return out;
  }
}

interface StageAgents {
  market_intelligence: Agent | null;
  signal_generation: Agent[];
  portfolio_manager: Agent | null;
  execution: Agent | null;
  risk_sentinel: Agent | null;
  compliance: Agent | null;
}

function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
