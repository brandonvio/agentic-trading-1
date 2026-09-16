/** PortfolioCycleOrchestrator: stage chaining, stage skipping and aggregation. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Agent, AgentKind } from "@/lib/domain/agent";
import { ForbiddenError } from "@/lib/core/errors";
import { AGENT_BLUEPRINTS } from "@/lib/agents/definitions";
import { makePosition, makeRiskLimit, makeStrategy } from "@/tests/fixtures/entities";
import { createAgentWorld, seedAgent, type AgentWorld } from "./fakes";

let world: AgentWorld;

beforeEach(async () => {
  world = await createAgentWorld();
  await world.repos.strategies.create(makeStrategy({ id: "strat_mom", code: "MOM-1", deskId: "desk_main", instrumentIds: ["ins_aapl", "ins_btc"] }));
  await world.repos.riskLimits.create(makeRiskLimit({ scope: "portfolio", scopeId: "pf_main", metric: "gross_exposure_pct_nav", threshold: 3 }));
  await world.repos.positions.create(makePosition({ portfolioId: "pf_main", instrumentId: "ins_aapl", symbol: "AAPL", marketValue: 4_000_000 }));
});

/** Seed a blueprint-configured agent of `kind` for the main portfolio. */
async function stageAgent(kind: AgentKind, overrides: Partial<Agent> = {}): Promise<Agent> {
  const bp = AGENT_BLUEPRINTS[kind];
  return seedAgent(world, {
    kind,
    name: bp.name,
    description: bp.description,
    autonomy: bp.defaultAutonomy,
    model: bp.defaultModel,
    tools: bp.defaultTools,
    guardrails: bp.guardrails,
    maxStepsPerRun: bp.defaultMaxSteps,
    maxNotionalPerRun: bp.defaultMaxNotionalPerRun,
    ownerUserId: world.users.pm.id,
    strategyIds: kind === "signal_generation" ? ["strat_mom"] : [],
    ...overrides,
  });
}

async function seedFullDesk(): Promise<void> {
  await stageAgent("market_intelligence", { portfolioId: null, deskId: null, name: "Firm Intel" });
  await stageAgent("signal_generation");
  await stageAgent("portfolio_manager");
  await stageAgent("execution");
  await stageAgent("risk_sentinel");
  await stageAgent("compliance");
}

describe("runPortfolioCycle", () => {
  it("runs every stage in pipeline order and chains their outputs", async () => {
    await seedFullDesk();
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);

    expect(result.runs.map((r) => r.agentKind)).toEqual([
      "market_intelligence",
      "signal_generation",
      "portfolio_manager",
      "execution",
      "risk_sentinel",
      "compliance",
    ]);
    expect(result.runs.every((r) => r.status === "succeeded")).toBe(true);
    expect(result.runs.every((r) => r.trigger === "orchestrator")).toBe(true);
    expect(result.runs.every((r) => r.triggeredBy.id === world.users.pm.id)).toBe(true);

    const [, signals, pm, execution] = result.runs;
    // The intel view is threaded into every downstream run.
    expect(signals.input.marketView).toMatchObject({ regime: "risk_on" });
    // The PM sees the signals its generator just created.
    expect(pm.input.signals).toHaveLength(signals.signalIds.length);
    expect(signals.signalIds.length).toBeGreaterThan(0);
    // Execution acts on the PM's decisions, not on raw signals.
    const decisions = execution.input.decisions as Array<{ signalId: string; action: string }>;
    expect(decisions.length).toBe(signals.signalIds.length);
    expect(decisions.every((d) => d.action === "approve" || d.action === "reduce")).toBe(true);
    expect(decisions.map((d) => d.signalId).sort()).toEqual([...signals.signalIds].sort());
  });

  it("returns the signals and orders the cycle produced", async () => {
    await seedFullDesk();
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.every((s) => s.portfolioId === world.portfolio.id)).toBe(true);
    expect(result.orders.length).toBe(result.signals.filter((s) => s.direction !== "HEDGE").length);
    expect(result.orders.every((o) => o.origin === "agent" && o.agentRunId !== null)).toBe(true);
    expect(world.orders.calls.every((c) => c.via === "agent")).toBe(true);
  });

  it("proposes a hedge when the risk report shows a breached limit", async () => {
    await seedFullDesk();
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    const sentinel = result.runs.find((r) => r.agentKind === "risk_sentinel");
    expect(sentinel?.output).toMatchObject({ severity: "critical" });
    expect(sentinel?.signalIds).toHaveLength(1);
    expect(result.signals.some((s) => s.direction === "HEDGE")).toBe(true);
  });

  it("skips stages that have no configured agent", async () => {
    await stageAgent("market_intelligence", { portfolioId: null, deskId: null, name: "Firm Intel" });
    await stageAgent("portfolio_manager");
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    expect(result.runs.map((r) => r.agentKind)).toEqual(["market_intelligence", "portfolio_manager"]);
    expect(result.orders).toEqual([]);
  });

  it("returns an empty cycle when the portfolio has no agents at all", async () => {
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    expect(result).toEqual({ runs: [], signals: [], orders: [] });
  });

  it("ignores disabled, paused and tool-less agents", async () => {
    await stageAgent("market_intelligence", { portfolioId: null, deskId: null, name: "Firm Intel", status: "disabled" });
    await stageAgent("signal_generation", { status: "paused" });
    await stageAgent("portfolio_manager", { tools: [] });
    await stageAgent("compliance");
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    expect(result.runs.map((r) => r.agentKind)).toEqual(["compliance"]);
  });

  it("runs every signal generator on the portfolio", async () => {
    await stageAgent("signal_generation", { name: "Momentum signals" });
    await stageAgent("signal_generation", { name: "Carry signals" });
    await stageAgent("portfolio_manager");
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    expect(result.runs.filter((r) => r.agentKind === "signal_generation")).toHaveLength(2);
    const pm = result.runs.find((r) => r.agentKind === "portfolio_manager");
    expect((pm?.input.signals as unknown[]).length).toBe(result.signals.length);
  });

  it("prefers a portfolio-scoped agent over a platform-wide one of the same kind", async () => {
    await stageAgent("market_intelligence", { portfolioId: null, deskId: null, name: "Firm Intel" });
    const scoped = await stageAgent("market_intelligence", { name: "Desk Intel" });
    const result = await world.orchestrator.runPortfolioCycle(world.principal("pm"), world.portfolio.id);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].agentId).toBe(scoped.id);
  });

  it("requires agents:run and portfolio visibility", async () => {
    await stageAgent("compliance");
    await expect(world.orchestrator.runPortfolioCycle(world.principal("analyst"), world.portfolio.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.orchestrator.runPortfolioCycle(world.principal("otherTrader"), world.portfolio.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
