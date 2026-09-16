/**
 * The agent runtime: a plan → act → observe loop over the LLM gateway.
 *
 * Every block the model emits is persisted as an ordered `AgentStep` before
 * anything else happens, so a run is fully reconstructable from the database
 * even if the process dies mid-loop. Tool failures are fed back to the model
 * as tool results (never thrown), so an agent can recover from a bad argument
 * the same way a human would.
 *
 * A run ends when the model stops asking for tools (`succeeded`), when it
 * exhausts its per-run turn budget (`budget_exhausted`), when the kill switch
 * is pulled (`killed`) or when something throws (`failed`).
 */
import type {
  Agent,
  AgentRun,
  AgentRunStatus,
  AgentRunTrigger,
  AgentStatus,
  AgentStep,
  AgentStepKind,
} from "@/lib/domain/agent";
import type { Actor, Permission, Principal, User } from "@/lib/domain/auth";
import type { Strategy } from "@/lib/domain/strategy";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { NotFoundError } from "@/lib/core/errors";
import { principalFromUser } from "@/lib/auth/permissions";
import type { LLMContentBlock, LLMMessage, LLMProvider, LLMToolUseBlock } from "@/lib/llm/types";
import { buildSystemPrompt, buildUserMessage, extractJsonBlock } from "@/lib/llm";
import type { ServicesAccessor } from "./services";
import { ToolRegistry, type ToolContext } from "./tools/registry";
import { defaultObjectiveFor } from "./definitions";

/**
 * Cooperative cancellation for in-flight runs. The runtime checks it between
 * LLM turns and after each batch of tool calls, so a killed run always stops
 * on a step boundary with its trace intact.
 */
export class KillSwitch {
  private readonly killed = new Set<string>();

  /** Ask the run to stop at its next checkpoint. */
  request(runId: string): void {
    this.killed.add(runId);
  }

  isKilled(runId: string): boolean {
    return this.killed.has(runId);
  }

  /** Forget a run id (called when the run has finished). */
  clear(runId: string): void {
    this.killed.delete(runId);
  }

  get size(): number {
    return this.killed.size;
  }
}

/**
 * Read permissions an agent inherits from its owner regardless of its tool
 * list. Write capability is never inherited: it must be declared by a granted
 * tool AND held by the owner.
 */
const AGENT_READ_PERMISSIONS: readonly Permission[] = [
  "market:read",
  "portfolios:read",
  "positions:read",
  "orders:read",
  "risk:read",
  "strategies:read",
  "agents:read",
  "approvals:read",
  "brokers:read",
  "research:read",
];

/**
 * Synthetic principal an agent acts as: its owner's identity and desk
 * visibility, with permissions narrowed to the read baseline plus whatever
 * its granted tools declare. An agent can therefore never do something its
 * owner could not do, nor something outside its tool allow-list.
 */
export function buildAgentPrincipal(owner: User, agent: Agent, registry: ToolRegistry): Principal {
  const base = principalFromUser(owner);
  const declared = new Set<Permission>(registry.permissionsFor(agent.tools));
  return {
    ...base,
    permissions: base.permissions.filter((p) => declared.has(p) || AGENT_READ_PERMISSIONS.includes(p)),
  };
}

export interface AgentRuntimeDeps {
  repos: Repositories;
  /** Resolved at call time so registration order and service cycles do not matter. */
  services: ServicesAccessor;
  llm: LLMProvider;
  registry: ToolRegistry;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  killSwitch: KillSwitch;
}

export interface StartRunInput {
  objective?: string;
  input?: Record<string, unknown>;
  trigger?: AgentRunTrigger;
  triggeredBy: Actor;
}

interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

const NO_USAGE: TurnUsage = { inputTokens: 0, outputTokens: 0, latencyMs: 0 };

export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  get killSwitch(): KillSwitch {
    return this.deps.killSwitch;
  }

  /** Persist a queued→running AgentRun row for `agent`, without executing it. */
  async start(agent: Agent, opts: StartRunInput): Promise<AgentRun> {
    const { repos, clock, ids } = this.deps;
    const run: AgentRun = {
      id: ids.next(ID_PREFIX.agentRun),
      agentId: agent.id,
      agentKind: agent.kind,
      agentName: agent.name,
      portfolioId: agent.portfolioId,
      status: "running",
      trigger: opts.trigger ?? "manual",
      triggeredBy: opts.triggeredBy,
      objective: opts.objective?.trim() || defaultObjectiveFor(agent.kind),
      input: opts.input ?? {},
      output: null,
      summary: "",
      stepCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      signalIds: [],
      orderIds: [],
      error: null,
      startedAt: clock.nowIso(),
      finishedAt: null,
    };
    return repos.agentRuns.create(run);
  }

  /** Start a run and drive it to completion. */
  async run(agent: Agent, opts: StartRunInput): Promise<AgentRun> {
    const run = await this.start(agent, opts);
    return this.execute(agent, run);
  }

  /**
   * Drive an existing run to completion: build the prompt, loop over the
   * model, persist every step, execute tools and finalise the run row.
   */
  async execute(agent: Agent, run: AgentRun): Promise<AgentRun> {
    const { repos, clock, ids, logger, registry, llm, killSwitch } = this.deps;
    const services = this.deps.services();
    const created = { signalIds: [] as string[], orderIds: [] as string[] };

    let index = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let status: AgentRunStatus = "running";
    let error: string | null = null;
    let finalText = "";

    const appendStep = async (part: {
      kind: AgentStepKind;
      content: string;
      toolName?: string | null;
      toolInput?: unknown;
      toolOutput?: unknown;
      usage?: TurnUsage;
    }): Promise<void> => {
      const step: AgentStep = {
        id: ids.next(ID_PREFIX.agentStep),
        runId: run.id,
        index: index++,
        kind: part.kind,
        content: part.content,
        toolName: part.toolName ?? null,
        toolInput: part.toolInput ?? null,
        toolOutput: part.toolOutput ?? null,
        inputTokens: part.usage?.inputTokens ?? 0,
        outputTokens: part.usage?.outputTokens ?? 0,
        latencyMs: part.usage?.latencyMs ?? 0,
        at: clock.nowIso(),
      };
      await repos.agentRuns.appendStep(step);
    };

    await services.audit.record({
      action: "agent.run_started",
      actor: { kind: "agent", id: agent.id, name: agent.name, runId: run.id },
      targetType: "agent_run",
      targetId: run.id,
      portfolioId: run.portfolioId,
      deskId: agent.deskId,
      summary: `${agent.name} started run ${run.id}: ${run.objective}`,
      data: { agentId: agent.id, kind: agent.kind, trigger: run.trigger, model: agent.model },
      ip: null,
    });

    const restingStatus = agent.status === "paused" || agent.status === "disabled" ? agent.status : "idle";
    if (agent.status !== "running") await repos.agents.update(agent.id, { status: "running" });

    try {
      const principal = await this.principalFor(agent);
      const portfolio = agent.portfolioId ? await repos.portfolios.findById(agent.portfolioId) : null;
      const strategies = await this.loadStrategies(agent.strategyIds);
      const system = buildSystemPrompt(agent, { portfolio, strategies });
      const tools = registry.definitionsFor(agent.tools);
      const messages: LLMMessage[] = [{ role: "user", content: buildUserMessage(run.objective, run.input) }];
      const ctx: ToolContext = { agent, run, principal, services, repos, clock, ids, logger, created };

      let turns = 0;
      for (;;) {
        if (killSwitch.isKilled(run.id)) {
          status = "killed";
          error = "Run terminated by the kill switch";
          break;
        }
        if (turns >= agent.maxStepsPerRun) {
          status = "budget_exhausted";
          error = `Step budget exhausted: ${agent.maxStepsPerRun} LLM turns`;
          break;
        }
        turns += 1;

        const completion = await llm.complete({
          model: agent.model,
          system,
          messages,
          tools,
          metadata: { agentId: agent.id, agentKind: agent.kind, runId: run.id },
        });
        inputTokens += completion.usage.inputTokens;
        outputTokens += completion.usage.outputTokens;
        costUsd += completion.usage.costUsd;

        // The turn's token/latency accounting is attributed to its first step.
        let turnUsage: TurnUsage = {
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          latencyMs: completion.usage.latencyMs,
        };
        const takeUsage = (): TurnUsage => {
          const u = turnUsage;
          turnUsage = NO_USAGE;
          return u;
        };

        const isFinalTurn = completion.stopReason !== "tool_use";
        const assistant: LLMContentBlock[] = [];
        const toolUses: LLMToolUseBlock[] = [];
        let text = "";

        for (const block of completion.content) {
          if (block.type === "text") {
            text = text ? `${text}\n${block.text}` : block.text;
            assistant.push(block);
            await appendStep({ kind: isFinalTurn ? "message" : "thought", content: block.text, usage: takeUsage() });
          } else if (block.type === "tool_use") {
            assistant.push(block);
            toolUses.push(block);
            await appendStep({ kind: "tool_call", content: block.name, toolName: block.name, toolInput: block.input, usage: takeUsage() });
          }
        }
        if (assistant.length > 0) messages.push({ role: "assistant", content: assistant });

        if (isFinalTurn || toolUses.length === 0) {
          finalText = text;
          status = "succeeded";
          break;
        }

        const results: LLMContentBlock[] = [];
        for (const use of toolUses) {
          const result = await registry.invoke(use.name, use.input, ctx);
          const payload: unknown = result.ok ? result.output : { ok: false, code: result.code, error: result.error, details: result.details ?? null };
          await appendStep({
            kind: result.ok ? "tool_result" : "error",
            content: result.ok ? `${use.name} returned a result` : `${use.name} failed: ${result.code} — ${result.error}`,
            toolName: use.name,
            toolInput: use.input,
            toolOutput: payload,
          });
          results.push({ type: "tool_result", toolUseId: use.id, content: JSON.stringify(payload ?? null), isError: !result.ok });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
      logger.error("agent run failed", { runId: run.id, agentId: agent.id, error });
      await appendStep({ kind: "error", content: error }).catch(() => undefined);
    }

    const output = status === "succeeded" ? extractJsonBlock(finalText) : null;
    const finished = await repos.agentRuns.update(run.id, {
      status,
      output,
      summary: summaryOf(status, output, finalText, error),
      stepCount: index,
      inputTokens,
      outputTokens,
      costUsd,
      signalIds: [...created.signalIds],
      orderIds: [...created.orderIds],
      error,
      finishedAt: clock.nowIso(),
    });

    const agentStatus: AgentStatus = status === "failed" ? "error" : restingStatus;
    await repos.agents.update(agent.id, { status: agentStatus, lastRunAt: finished.finishedAt, lastRunId: finished.id });
    killSwitch.clear(run.id);

    await services.audit.record({
      action: "agent.run_finished",
      actor: { kind: "agent", id: agent.id, name: agent.name, runId: run.id },
      targetType: "agent_run",
      targetId: run.id,
      portfolioId: run.portfolioId,
      deskId: agent.deskId,
      summary: `${agent.name} finished run ${run.id} with status ${status}`,
      data: {
        status,
        stepCount: finished.stepCount,
        inputTokens: finished.inputTokens,
        outputTokens: finished.outputTokens,
        costUsd: finished.costUsd,
        signalIds: finished.signalIds,
        orderIds: finished.orderIds,
        error,
      },
      ip: null,
    });

    return finished;
  }

  /** The principal an agent acts as; throws if the owning user no longer exists. */
  private async principalFor(agent: Agent): Promise<Principal> {
    const owner = await this.deps.repos.users.findById(agent.ownerUserId);
    if (!owner) throw new NotFoundError("User", agent.ownerUserId);
    return buildAgentPrincipal(owner, agent, this.deps.registry);
  }

  private async loadStrategies(ids: readonly string[]): Promise<Strategy[]> {
    const out: Strategy[] = [];
    for (const id of ids) {
      const s = await this.deps.repos.strategies.findById(id);
      if (s) out.push(s);
    }
    return out;
  }
}

/** One-line human summary of the run, preferring the model's own. */
function summaryOf(status: AgentRunStatus, output: Record<string, unknown> | null, finalText: string, error: string | null): string {
  const fromOutput = output && typeof output.summary === "string" ? output.summary.trim() : "";
  if (fromOutput) return fromOutput;
  if (status === "succeeded") {
    const narrative = finalText.split("```")[0].trim();
    return narrative ? narrative.slice(0, 400) : "Run completed without a structured summary.";
  }
  return error ? `Run ${status}: ${error}` : `Run ${status}.`;
}
