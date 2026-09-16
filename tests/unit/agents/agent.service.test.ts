/** AgentServiceImpl: RBAC, visibility, lifecycle, kill switch and usage aggregation. */
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateAgentInput } from "@/lib/domain/agent";
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import { AGENT_BLUEPRINTS } from "@/lib/agents/definitions";
import { makeAgentRun, makeStrategy } from "@/tests/fixtures/entities";
import { createAgentWorld, seedAgent, seedRun, type AgentWorld } from "./fakes";

let world: AgentWorld;

const PAGE = { limit: 50, offset: 0 };

beforeEach(async () => {
  world = await createAgentWorld();
});

function createInput(overrides: Partial<CreateAgentInput> = {}): CreateAgentInput {
  const bp = AGENT_BLUEPRINTS.signal_generation;
  return {
    kind: "signal_generation",
    name: "New signals",
    description: bp.description,
    status: "idle",
    autonomy: bp.defaultAutonomy,
    model: bp.defaultModel,
    portfolioId: world.portfolio.id,
    deskId: "desk_main",
    strategyIds: [],
    tools: bp.defaultTools,
    schedule: bp.defaultSchedule,
    guardrails: bp.guardrails,
    maxStepsPerRun: bp.defaultMaxSteps,
    maxNotionalPerRun: bp.defaultMaxNotionalPerRun,
    ownerUserId: world.users.pm.id,
    ...overrides,
  };
}

describe("get / list", () => {
  it("requires agents:read", async () => {
    const agent = await seedAgent(world);
    await expect(world.agentService.get({ ...world.principal("pm"), permissions: [] }, agent.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides agents on portfolios the principal cannot see", async () => {
    const agent = await seedAgent(world);
    await expect(world.agentService.get(world.principal("otherTrader"), agent.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.agentService.get(world.principal("analyst"), agent.id)).resolves.toMatchObject({ id: agent.id });
  });

  it("throws NotFoundError for an unknown id", async () => {
    await expect(world.agentService.get(world.principal("pm"), "agt_nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists visible portfolio agents plus platform-wide ones", async () => {
    const scoped = await seedAgent(world, { name: "Desk signals" });
    const global = await seedAgent(world, { name: "Firm intel", kind: "market_intelligence", portfolioId: null, deskId: null });
    const foreign = await seedAgent(world, { name: "Other desk", portfolioId: world.otherPortfolio.id, deskId: "desk_other" });

    const forPm = await world.agentService.list(world.principal("pm"), {}, PAGE);
    expect(forPm.items.map((a) => a.id).sort()).toEqual([global.id, scoped.id].sort());

    const forAdmin = await world.agentService.list(world.principal("admin"), {}, PAGE);
    expect(forAdmin.items.map((a) => a.id).sort()).toEqual([foreign.id, global.id, scoped.id].sort());
  });

  it("filters by kind and status", async () => {
    await seedAgent(world, { name: "A", kind: "execution" });
    await seedAgent(world, { name: "B", kind: "compliance", status: "paused" });
    expect((await world.agentService.list(world.principal("pm"), { kind: "execution" }, PAGE)).total).toBe(1);
    expect((await world.agentService.list(world.principal("pm"), { status: "paused" }, PAGE)).total).toBe(1);
  });
});

describe("create / update", () => {
  it("requires agents:configure and records an audit event", async () => {
    await expect(world.agentService.create(world.principal("trader"), createInput())).rejects.toBeInstanceOf(ForbiddenError);
    const agent = await world.agentService.create(world.principal("pm"), createInput());
    expect(agent.id).toMatch(/^agt_/);
    expect(agent).toMatchObject({ lastRunAt: null, lastRunId: null, createdAt: world.clock.nowIso() });
    const audit = await world.repos.audit.list({ action: "agent.created" }, PAGE);
    expect(audit.items[0]).toMatchObject({ targetId: agent.id, actor: { kind: "user", id: world.users.pm.id } });
  });

  it("rejects unknown tool names", async () => {
    await expect(world.agentService.create(world.principal("pm"), createInput({ tools: ["get_quotes", "hack_the_planet"] }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects a portfolio the principal cannot see", async () => {
    await expect(world.agentService.create(world.principal("pm"), createInput({ portfolioId: world.otherPortfolio.id }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("updates and audits", async () => {
    const agent = await seedAgent(world);
    const updated = await world.agentService.update(world.principal("pm"), agent.id, { autonomy: "supervised", maxStepsPerRun: 5 });
    expect(updated).toMatchObject({ autonomy: "supervised", maxStepsPerRun: 5 });
    const audit = await world.repos.audit.list({ action: "agent.updated" }, PAGE);
    expect(audit.items[0].data).toMatchObject({ changed: ["autonomy", "maxStepsPerRun"] });
  });

  it("refuses to update an agent the principal cannot see", async () => {
    const agent = await seedAgent(world);
    await expect(world.agentService.update(world.principal("otherTrader"), agent.id, { name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("run", () => {
  beforeEach(async () => {
    await world.repos.strategies.create(makeStrategy({ id: "strat_mom", deskId: "desk_main", instrumentIds: ["ins_aapl"] }));
  });

  it("requires agents:run and returns the finished run", async () => {
    const agent = await seedAgent(world, { kind: "market_intelligence", tools: AGENT_BLUEPRINTS.market_intelligence.defaultTools, ownerUserId: world.users.admin.id });
    await expect(world.agentService.run(world.principal("analyst"), agent.id, {})).rejects.toBeInstanceOf(ForbiddenError);

    const run = await world.agentService.run(world.principal("pm"), agent.id, { objective: "Read the tape", input: { portfolioId: world.portfolio.id } });
    expect(run).toMatchObject({ status: "succeeded", agentId: agent.id, trigger: "manual", objective: "Read the tape" });
    expect(run.triggeredBy).toMatchObject({ kind: "user", id: world.users.pm.id });
    expect(run.finishedAt).not.toBeNull();
  });

  it("refuses to run a disabled or tool-less agent", async () => {
    const disabled = await seedAgent(world, { name: "Off", status: "disabled" });
    await expect(world.agentService.run(world.principal("pm"), disabled.id, {})).rejects.toBeInstanceOf(InvalidStateError);
    const naked = await seedAgent(world, { name: "Naked", tools: [] });
    await expect(world.agentService.run(world.principal("pm"), naked.id, {})).rejects.toBeInstanceOf(InvalidStateError);
  });
});

describe("kill", () => {
  it("requires agents:kill, marks the run killed and audits it", async () => {
    const agent = await seedAgent(world);
    const run = await seedRun(world, agent, { status: "running" });
    await expect(world.agentService.kill(world.principal("trader"), run.id, "too hot")).rejects.toBeInstanceOf(ForbiddenError);

    const killed = await world.agentService.kill(world.principal("pm"), run.id, "exposure spiked");
    expect(killed).toMatchObject({ status: "killed", error: "exposure spiked", finishedAt: world.clock.nowIso() });
    expect(world.killSwitch.isKilled(run.id)).toBe(true);
    const audit = await world.repos.audit.list({ action: "agent.killed" }, PAGE);
    expect(audit.items[0]).toMatchObject({ targetId: run.id });
  });

  it("returns a finished run unchanged", async () => {
    const agent = await seedAgent(world);
    const run = await seedRun(world, agent, { status: "succeeded", summary: "all good", finishedAt: world.clock.nowIso() });
    const result = await world.agentService.kill(world.principal("pm"), run.id, "too late");
    expect(result).toEqual(run);
    expect(world.killSwitch.isKilled(run.id)).toBe(false);
  });
});

describe("runs and steps", () => {
  it("scopes run reads to visible portfolios", async () => {
    const agent = await seedAgent(world);
    const run = await seedRun(world, agent);
    await expect(world.agentService.getRun(world.principal("otherTrader"), run.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.agentService.getRun(world.principal("analyst"), run.id)).resolves.toMatchObject({ id: run.id });
    await expect(world.agentService.listSteps(world.principal("otherTrader"), run.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists runs newest first and filters by agent", async () => {
    const a = await seedAgent(world, { name: "A" });
    const b = await seedAgent(world, { name: "B" });
    await seedRun(world, a, { startedAt: "2026-09-01T09:00:00.000Z" });
    const newer = await seedRun(world, b, { startedAt: "2026-09-01T10:00:00.000Z" });
    const page = await world.agentService.listRuns(world.principal("pm"), {}, PAGE);
    expect(page.items[0].id).toBe(newer.id);
    expect((await world.agentService.listRuns(world.principal("pm"), { agentId: a.id }, PAGE)).total).toBe(1);
  });

  it("returns the ordered step trace", async () => {
    const agent = await seedAgent(world, { kind: "market_intelligence", tools: AGENT_BLUEPRINTS.market_intelligence.defaultTools, ownerUserId: world.users.admin.id });
    const run = await world.agentService.run(world.principal("pm"), agent.id, { input: { portfolioId: world.portfolio.id } });
    const steps = await world.agentService.listSteps(world.principal("pm"), run.id);
    expect(steps).toHaveLength(run.stepCount);
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
  });
});

describe("usageStats", () => {
  beforeEach(async () => {
    const agent = await seedAgent(world);
    const base = { agentId: agent.id, portfolioId: world.portfolio.id };
    await world.repos.agentRuns.create(
      makeAgentRun({ ...base, agentKind: "signal_generation", status: "succeeded", startedAt: "2026-09-01T09:00:00.000Z", inputTokens: 1_000, outputTokens: 200, costUsd: 0.5, signalIds: ["sig_1", "sig_2"] }),
    );
    await world.repos.agentRuns.create(
      makeAgentRun({ ...base, agentKind: "execution", status: "failed", startedAt: "2026-09-01T09:30:00.000Z", inputTokens: 500, outputTokens: 100, costUsd: 0.25, orderIds: ["ord_1"] }),
    );
    await world.repos.agentRuns.create(
      makeAgentRun({ ...base, agentKind: "signal_generation", status: "succeeded", startedAt: "2026-08-31T09:00:00.000Z", inputTokens: 250, outputTokens: 50, costUsd: 0.125 }),
    );
  });

  it("aggregates runs, tokens and cost, splitting today from all time", async () => {
    const stats = await world.agentService.usageStats(world.principal("pm"));
    expect(stats).toMatchObject({
      asOf: world.clock.nowIso(),
      runsToday: 2,
      runsTotal: 3,
      successRatePct: 66.67,
      inputTokens: 1_750,
      outputTokens: 350,
      costUsdToday: 0.75,
      costUsdTotal: 0.875,
    });
  });

  it("breaks usage down by agent kind, omitting kinds with no runs", async () => {
    const stats = await world.agentService.usageStats(world.principal("pm"));
    expect(stats.byKind).toEqual([
      { kind: "signal_generation", runs: 2, costUsd: 0.625, signals: 2, orders: 0 },
      { kind: "execution", runs: 1, costUsd: 0.25, signals: 0, orders: 1 },
    ]);
  });

  it("returns zeroes when nothing is visible", async () => {
    const stats = await world.agentService.usageStats(world.principal("otherTrader"));
    expect(stats).toMatchObject({ runsToday: 0, runsTotal: 0, successRatePct: 0, costUsdTotal: 0, byKind: [] });
  });

  it("requires agents:read", async () => {
    await expect(world.agentService.usageStats({ ...world.principal("pm"), permissions: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("runPortfolioCycle", () => {
  it("requires agents:run before delegating to the orchestrator", async () => {
    await expect(world.agentService.runPortfolioCycle(world.principal("analyst"), world.portfolio.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.agentService.runPortfolioCycle(world.principal("pm"), world.portfolio.id)).resolves.toEqual({ runs: [], signals: [], orders: [] });
  });
});
