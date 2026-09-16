/** AgentRuntime: step persistence, stop conditions, accounting and output parsing. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@/lib/domain/agent";
import type { LLMCompletion, LLMCompletionRequest, LLMProvider, LLMUsage } from "@/lib/llm/types";
import { AGENT_BLUEPRINTS, defaultObjectiveFor } from "@/lib/agents/definitions";
import { buildAgentPrincipal } from "@/lib/agents/runtime";
import { makeStrategy } from "@/tests/fixtures/entities";
import { LoopingLLMProvider, ThrowingLLMProvider, createAgentWorld, seedAgent, type AgentWorld } from "./fakes";

let world: AgentWorld;

const USER_ACTOR = { kind: "user", id: "usr_pm", name: "pm user" } as const;

beforeEach(async () => {
  world = await createAgentWorld();
});

/** A signal-generation agent wired to the blueprint defaults, with a real strategy. */
async function signalAgent(overrides: Partial<Agent> = {}): Promise<Agent> {
  const bp = AGENT_BLUEPRINTS.signal_generation;
  const strategy = await world.repos.strategies.create(
    makeStrategy({ id: "strat_mom", code: "MOM-1", deskId: "desk_main", instrumentIds: ["ins_aapl", "ins_btc"] }),
  );
  return seedAgent(world, {
    kind: "signal_generation",
    name: "GM Signals",
    autonomy: "advisory",
    model: bp.defaultModel,
    tools: bp.defaultTools,
    guardrails: bp.guardrails,
    maxStepsPerRun: bp.defaultMaxSteps,
    strategyIds: [strategy.id],
    ownerUserId: world.users.admin.id,
    ...overrides,
  });
}

describe("a successful run", () => {
  it("persists every block as an ordered step with the right kinds", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, {
      objective: "Generate signals for the momentum book",
      input: { portfolioId: world.portfolio.id, strategyId: "strat_mom" },
      triggeredBy: USER_ACTOR,
    });

    expect(run.status).toBe("succeeded");
    const steps = await world.repos.agentRuns.listSteps(run.id);
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
    expect(steps).toHaveLength(run.stepCount);

    // Each tool turn is thought → tool_call → tool_result; the run ends on a message.
    const toolCalls = steps.filter((s) => s.kind === "tool_call");
    const toolResults = steps.filter((s) => s.kind === "tool_result");
    expect(toolCalls.map((s) => s.toolName)).toEqual([
      "get_strategy",
      "get_market_overview",
      "get_quotes",
      "get_bars",
      "get_portfolio_snapshot",
      "propose_signal",
      "propose_signal",
    ]);
    expect(toolResults).toHaveLength(toolCalls.length);
    expect(steps.filter((s) => s.kind === "error")).toHaveLength(0);
    expect(steps.at(-1)?.kind).toBe("message");
    expect(steps[0]).toMatchObject({ kind: "thought", toolName: null });
    expect(steps[1]).toMatchObject({ kind: "tool_call", toolName: "get_strategy", toolInput: { strategyId: "strat_mom" } });
    expect(steps[2].kind).toBe("tool_result");
    expect(steps[2].toolOutput).toMatchObject({ code: "MOM-1" });
  });

  it("parses the final JSON block into run.output and lifts the summary", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id, strategyId: "strat_mom" }, triggeredBy: USER_ACTOR });
    expect(run.output).not.toBeNull();
    expect(run.output?.signals).toHaveLength(2);
    expect(run.summary).toBe(run.output?.summary);
    expect(run.summary).toContain("Proposed 2 signal(s)");
  });

  it("collects ids created by tools onto the run", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id, strategyId: "strat_mom" }, triggeredBy: USER_ACTOR });
    expect(run.signalIds).toHaveLength(2);
    expect(run.orderIds).toEqual([]);
    for (const id of run.signalIds) {
      const signal = await world.repos.signals.findById(id);
      expect(signal).toMatchObject({ runId: run.id, agentId: agent.id, portfolioId: world.portfolio.id, status: "new" });
    }
  });

  it("uses the kind's default objective when none is given", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    expect(run.objective).toBe(defaultObjectiveFor("signal_generation"));
  });

  it("updates the agent's last-run pointers and returns it to idle", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    const after = await world.repos.agents.findById(agent.id);
    expect(after).toMatchObject({ status: "idle", lastRunId: run.id, lastRunAt: run.finishedAt });
  });

  it("emits agent.run_started and agent.run_finished", async () => {
    const agent = await signalAgent();
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    const events = await world.repos.audit.list({ targetId: run.id }, { limit: 10, offset: 0 });
    expect(events.items.map((e) => e.action).sort()).toEqual(["agent.run_finished", "agent.run_started"]);
    const finished = events.items.find((e) => e.action === "agent.run_finished");
    expect(finished?.data).toMatchObject({ status: "succeeded", stepCount: run.stepCount });
    expect(finished?.actor).toMatchObject({ kind: "agent", id: agent.id, runId: run.id });
  });
});

describe("accounting", () => {
  it("accumulates tokens and cost across turns and attributes them to the first step of each", async () => {
    const agent = await seedAgent(world, { kind: "market_intelligence", tools: ["get_market_overview"], maxStepsPerRun: 3, ownerUserId: world.users.admin.id });
    const runtime = world.withProvider(new LoopingLLMProvider("get_market_overview"));
    const run = await runtime.run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });

    expect(run.status).toBe("budget_exhausted");
    expect(run.inputTokens).toBe(300);
    expect(run.outputTokens).toBe(60);
    expect(run.costUsd).toBeCloseTo(0.003, 10);

    const steps = await world.repos.agentRuns.listSteps(run.id);
    expect(steps).toHaveLength(9);
    expect(steps.filter((s) => s.inputTokens > 0)).toHaveLength(3);
    expect(steps[0]).toMatchObject({ kind: "thought", inputTokens: 100, outputTokens: 20, latencyMs: 10 });
    expect(steps[1]).toMatchObject({ kind: "tool_call", inputTokens: 0 });
  });
});

describe("stop conditions", () => {
  it("stops with budget_exhausted at the turn limit", async () => {
    const agent = await seedAgent(world, { kind: "market_intelligence", tools: ["get_market_overview"], maxStepsPerRun: 2, ownerUserId: world.users.admin.id });
    const provider = new LoopingLLMProvider("get_market_overview");
    const run = await world.withProvider(provider).run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    expect(provider.turns).toBe(2);
    expect(run.status).toBe("budget_exhausted");
    expect(run.error).toContain("Step budget exhausted");
    expect(run.output).toBeNull();
    expect(run.summary).toContain("budget_exhausted");
  });

  it("stops immediately when the kill switch is already set", async () => {
    const agent = await signalAgent();
    const started = await world.runtime.start(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    world.killSwitch.request(started.id);
    const run = await world.runtime.execute(agent, started);
    expect(run.status).toBe("killed");
    expect(run.stepCount).toBe(0);
    expect(run.error).toBe("Run terminated by the kill switch");
    // The switch is cleared once the run has stopped.
    expect(world.killSwitch.isKilled(run.id)).toBe(false);
  });

  it("stops mid-run when the switch is pulled between turns", async () => {
    const agent = await seedAgent(world, { kind: "market_intelligence", tools: ["get_market_overview"], maxStepsPerRun: 10, ownerUserId: world.users.admin.id });
    const looping = new LoopingLLMProvider("get_market_overview");
    let runId = "";
    const provider: LLMProvider = {
      name: "kill-after-two",
      async complete(req: LLMCompletionRequest): Promise<LLMCompletion> {
        const completion = await looping.complete(req);
        if (looping.turns >= 2) world.killSwitch.request(runId);
        return completion;
      },
      async completeJson<T>(): Promise<{ value: T; usage: LLMUsage }> {
        throw new Error("not implemented");
      },
    };
    const runtime = world.withProvider(provider);
    const started = await runtime.start(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    runId = started.id;
    const run = await runtime.execute(agent, started);
    expect(looping.turns).toBe(2);
    expect(run.status).toBe("killed");
    expect(run.stepCount).toBe(6);
  });

  it("records a failure when the gateway throws", async () => {
    const agent = await signalAgent();
    const run = await world.withProvider(new ThrowingLLMProvider("gateway unavailable")).run(agent, {
      input: { portfolioId: world.portfolio.id },
      triggeredBy: USER_ACTOR,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toBe("gateway unavailable");
    expect(run.summary).toContain("gateway unavailable");
    const steps = await world.repos.agentRuns.listSteps(run.id);
    expect(steps).toEqual([expect.objectContaining({ kind: "error", content: "gateway unavailable" })]);
    expect((await world.repos.agents.findById(agent.id))?.status).toBe("error");
  });

  it("fails cleanly when the owning user no longer exists", async () => {
    const agent = await signalAgent({ ownerUserId: "usr_ghost" });
    const run = await world.runtime.run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });
    expect(run.status).toBe("failed");
    expect(run.error).toContain("usr_ghost");
  });
});

describe("tool failures", () => {
  it("persists a tool error as an error step and keeps going", async () => {
    // The agent is granted a tool its kind may not use: the registry refuses it,
    // the runtime records the refusal and the model moves on.
    const agent = await seedAgent(world, {
      kind: "market_intelligence",
      tools: ["submit_order", "get_market_overview"],
      maxStepsPerRun: 3,
      ownerUserId: world.users.admin.id,
    });
    const provider = new LoopingLLMProvider("submit_order", { instrumentId: "ins_aapl", side: "BUY", quantity: 1, rationale: "x" });
    const run = await world.withProvider(provider).run(agent, { input: { portfolioId: world.portfolio.id }, triggeredBy: USER_ACTOR });

    const steps = await world.repos.agentRuns.listSteps(run.id);
    const errors = steps.filter((s) => s.kind === "error");
    expect(errors).toHaveLength(3);
    expect(errors[0].content).toContain("TOOL_KIND_FORBIDDEN");
    expect(errors[0].toolOutput).toMatchObject({ ok: false, code: "TOOL_KIND_FORBIDDEN" });
    expect(run.status).toBe("budget_exhausted");
    expect(world.orders.calls).toHaveLength(0);
  });
});

describe("buildAgentPrincipal", () => {
  it("keeps read rights but narrows writes to the declared tool permissions", async () => {
    const agent = await seedAgent(world, { tools: ["get_quotes", "propose_signal"], ownerUserId: world.users.pm.id });
    const principal = buildAgentPrincipal(world.users.pm, agent, world.registry);
    expect(principal.permissions).toContain("market:read");
    expect(principal.permissions).toContain("agents:run");
    expect(principal.permissions).not.toContain("orders:create");
    expect(principal.permissions).not.toContain("agents:configure");
    expect(principal.deskIds).toEqual(world.users.pm.deskIds);
  });

  it("never grants a permission the owner does not hold", async () => {
    const agent = await seedAgent(world, { tools: ["submit_order"], ownerUserId: world.users.analyst.id });
    const principal = buildAgentPrincipal(world.users.analyst, agent, world.registry);
    expect(principal.permissions).not.toContain("orders:create");
  });
});
