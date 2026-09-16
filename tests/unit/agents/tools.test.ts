/** Tool registry gating (grant, kind, autonomy, permission, validation) and every tool's contract. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Agent, AgentRun } from "@/lib/domain/agent";
import { ALL_TOOL_NAMES, createToolRegistry } from "@/lib/agents/tools";
import { defineTool, type ToolContext, type ToolInvocationResult } from "@/lib/agents/tools/registry";
import { z } from "zod";
import { makePosition, makeRiskLimit, makeSignal, makeStrategy, makeOrder } from "@/tests/fixtures/entities";
import { createAgentWorld, seedAgent, seedRun, toolContextFor, type AgentWorld } from "./fakes";

let world: AgentWorld;
let agent: Agent;
let run: AgentRun;
let ctx: ToolContext;

const registry = createToolRegistry();

async function invoke(name: string, input: unknown = {}): Promise<ToolInvocationResult> {
  return registry.invoke(name, input, ctx);
}

/** Unwrap a successful invocation, failing loudly with the tool error otherwise. */
async function ok(name: string, input: unknown = {}): Promise<Record<string, unknown>> {
  const result = await invoke(name, input);
  if (!result.ok) throw new Error(`${name} failed: ${result.code} ${result.error}`);
  return result.output as Record<string, unknown>;
}

beforeEach(async () => {
  world = await createAgentWorld();
  agent = await seedAgent(world, { kind: "execution", autonomy: "autonomous" });
  run = await seedRun(world, agent);
  ctx = toolContextFor(world, agent, run, world.users.admin);
});

describe("tool catalogue", () => {
  it("ships the sixteen documented tools with unique names and JSON schemas", () => {
    expect(ALL_TOOL_NAMES).toEqual([
      "get_market_overview",
      "get_quotes",
      "get_bars",
      "search_instruments",
      "get_portfolio_snapshot",
      "list_positions",
      "get_risk_report",
      "list_open_orders",
      "list_recent_signals",
      "get_strategy",
      "propose_signal",
      "request_hedge",
      "submit_order",
      "cancel_order",
      "flag_compliance_issue",
      "summarize_run",
    ]);
    expect(new Set(ALL_TOOL_NAMES).size).toBe(ALL_TOOL_NAMES.length);
    for (const def of registry.list()) {
      expect(def.description.length).toBeGreaterThan(80);
      expect(def.inputSchema).toHaveProperty("type", "object");
    }
  });

  it("exposes LLM tool definitions in the order requested, skipping unknown names", () => {
    const defs = registry.definitionsFor(["get_quotes", "nope", "submit_order"]);
    expect(defs.map((d) => d.name)).toEqual(["get_quotes", "submit_order"]);
  });

  it("collects the permissions declared by a tool set", () => {
    expect(registry.permissionsFor(["get_quotes", "submit_order", "summarize_run"]).sort()).toEqual(["market:read", "orders:create"]);
  });

  it("refuses duplicate registrations", () => {
    const dup = defineTool({ name: "get_quotes", description: "x", schema: z.object({}), async execute() { return null; } });
    expect(() => createToolRegistry([dup])).toThrow(/already registered/);
  });
});

describe("gating", () => {
  it("returns UNKNOWN_TOOL rather than throwing", async () => {
    expect(await invoke("teleport")).toMatchObject({ ok: false, code: "UNKNOWN_TOOL" });
  });

  it("refuses tools that are not in the agent's allow-list", async () => {
    ctx = toolContextFor(world, { ...agent, tools: ["get_quotes"] }, run, world.users.admin);
    expect(await invoke("get_market_overview")).toMatchObject({ ok: false, code: "TOOL_NOT_GRANTED" });
  });

  it("refuses tools closed to the agent's kind", async () => {
    const intel = await seedAgent(world, { kind: "market_intelligence", name: "Intel" });
    ctx = toolContextFor(world, intel, run, world.users.admin);
    const result = await invoke("submit_order", { instrumentId: "ins_aapl", side: "BUY", quantity: 10, rationale: "x" });
    expect(result).toMatchObject({ ok: false, code: "TOOL_KIND_FORBIDDEN" });
  });

  it("refuses order tools for advisory agents but still allows proposals", async () => {
    const advisory = await seedAgent(world, { kind: "execution", autonomy: "advisory", name: "Advisory exec" });
    ctx = toolContextFor(world, advisory, run, world.users.admin);
    expect(await invoke("submit_order", { instrumentId: "ins_aapl", side: "BUY", quantity: 10, rationale: "x" })).toMatchObject({
      ok: false,
      code: "AUTONOMY_FORBIDDEN",
    });
    expect(await invoke("cancel_order", { orderId: "ord_1", reason: "stale" })).toMatchObject({ ok: false, code: "AUTONOMY_FORBIDDEN" });
    expect((await invoke("get_quotes", { instrumentIds: ["ins_aapl"] })).ok).toBe(true);
  });

  it("refuses tools whose permission the owning user does not hold", async () => {
    // An analyst can read, but holds neither orders:create nor orders:cancel.
    ctx = toolContextFor(world, agent, run, world.users.analyst);
    expect(await invoke("submit_order", { instrumentId: "ins_aapl", side: "BUY", quantity: 10, rationale: "x" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect((await invoke("get_portfolio_snapshot")).ok).toBe(true);
  });

  it("returns VALIDATION_ERROR with the offending paths", async () => {
    const result = await invoke("get_bars", { instrumentId: "", count: 9999 });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    if (!result.ok) expect(result.error).toMatch(/instrumentId|count/);
  });

  it("returns thrown AppErrors as results, preserving the code", async () => {
    const result = await invoke("get_strategy", { strategyId: "strat_missing" });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("returns unexpected errors as TOOL_ERROR", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always throws",
      schema: z.object({}),
      async execute() {
        throw new Error("kaboom");
      },
    });
    const withBoom = createToolRegistry([boom]);
    const result = await withBoom.invoke("boom", {}, toolContextFor(world, { ...agent, tools: ["boom"] }, run, world.users.admin));
    expect(result).toEqual({ ok: false, code: "TOOL_ERROR", error: "kaboom" });
  });

  it("keeps an agent inside its portfolio scope", async () => {
    const result = await invoke("get_portfolio_snapshot", { portfolioId: world.otherPortfolio.id });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("requires an explicit portfolio for platform-wide agents", async () => {
    const global = await seedAgent(world, { name: "Global intel", portfolioId: null, kind: "market_intelligence" });
    ctx = toolContextFor(world, global, run, world.users.admin);
    expect(await invoke("get_portfolio_snapshot")).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("read-only tools", () => {
  it("get_market_overview returns the regime and movers", async () => {
    const out = await ok("get_market_overview");
    expect(out.regime).toBe("risk_on");
    expect(Array.isArray(out.movers)).toBe(true);
  });

  it("get_quotes resolves instrument ids and symbols and reports what it could not resolve", async () => {
    const out = await ok("get_quotes", { instrumentIds: ["ins_aapl"], symbols: ["BTC-USD", "NOPE"] });
    const quotes = out.quotes as Array<{ symbol: string }>;
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["AAPL", "BTC-USD"]);
    expect(out.unresolved).toEqual(["NOPE"]);
  });

  it("get_quotes rejects an empty request", async () => {
    expect(await invoke("get_quotes", {})).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("get_bars returns the window plus summary statistics", async () => {
    const out = await ok("get_bars", { instrumentId: "ins_aapl", interval: "1d", count: 10 });
    expect(out.count).toBe(10);
    expect(out.stats).toMatchObject({ lastClose: expect.any(Number), high: expect.any(Number) });
  });

  it("search_instruments finds by free text", async () => {
    const out = await ok("search_instruments", { query: "AAPL" });
    expect((out.instruments as Array<{ symbol: string }>).map((i) => i.symbol)).toEqual(["AAPL"]);
  });

  it("get_portfolio_snapshot includes the mandate", async () => {
    const out = await ok("get_portfolio_snapshot");
    expect(out.nav).toBe(50_000_000);
    expect(out.portfolio).toMatchObject({ code: "GM-ALPHA", mandate: { agentTradingEnabled: true } });
  });

  it("list_positions summarises open positions", async () => {
    await world.repos.positions.create(makePosition({ portfolioId: world.portfolio.id, instrumentId: "ins_aapl", symbol: "AAPL", marketValue: 1_000_000 }));
    const out = await ok("list_positions", {});
    expect(out.total).toBe(1);
    expect((out.positions as Array<{ symbol: string }>)[0].symbol).toBe("AAPL");
  });

  it("get_risk_report surfaces limit status", async () => {
    await world.repos.riskLimits.create(makeRiskLimit({ scope: "portfolio", scopeId: world.portfolio.id }));
    const out = await ok("get_risk_report");
    expect((out.limits as Array<{ status: string }>)[0].status).toBe("breached");
  });

  it("list_open_orders excludes terminal orders", async () => {
    await world.repos.orders.create(makeOrder({ portfolioId: world.portfolio.id, status: "ROUTED" }));
    await world.repos.orders.create(makeOrder({ portfolioId: world.portfolio.id, status: "FILLED" }));
    const out = await ok("list_open_orders", {});
    expect(out.total).toBe(1);
  });

  it("list_recent_signals filters by status", async () => {
    await world.repos.signals.create(makeSignal({ portfolioId: world.portfolio.id, status: "new" }));
    await world.repos.signals.create(makeSignal({ portfolioId: world.portfolio.id, status: "acted" }));
    expect((await ok("list_recent_signals", { status: "new" })).total).toBe(1);
    expect((await ok("list_recent_signals", {})).total).toBe(2);
  });

  it("get_strategy returns the thesis, parameters and universe", async () => {
    const strategy = await world.repos.strategies.create(makeStrategy({ code: "MOM-1", deskId: "desk_main" }));
    const out = await ok("get_strategy", { strategyId: strategy.id });
    expect(out).toMatchObject({ code: "MOM-1", thesis: "Momentum persists", instrumentIds: ["ins_fx0001"] });
  });
});

describe("write tools", () => {
  const signalInput = {
    instrumentId: "ins_aapl",
    direction: "LONG" as const,
    conviction: 0.7,
    expectedReturnPct: 0.025,
    horizonHours: 48,
    suggestedNotional: 500_000,
    suggestedQuantity: 2_500,
    entryPrice: 200,
    stopPrice: 196,
    targetPrice: 208,
    thesis: "Breakout above the 20-day high on expanding volume.",
    factors: [{ factor: "momentum", weight: 0.6, evidence: "session change +1.20%" }],
  };

  it("propose_signal persists the signal, links it to the run and audits it", async () => {
    const out = await ok("propose_signal", signalInput);
    const signalId = String(out.signalId);
    expect(ctx.created.signalIds).toEqual([signalId]);

    const stored = await world.repos.signals.findById(signalId);
    expect(stored).toMatchObject({
      symbol: "AAPL",
      assetClass: "equity",
      portfolioId: world.portfolio.id,
      agentId: agent.id,
      runId: run.id,
      direction: "LONG",
      side: "BUY",
      status: "new",
    });
    expect(stored?.expiresAt).toBe("2026-09-03T10:00:00.000Z");

    const audit = await world.repos.audit.list({ action: "signal.created" }, { limit: 10, offset: 0 });
    expect(audit.total).toBe(1);
    expect(audit.items[0].actor).toMatchObject({ kind: "agent", id: agent.id, runId: run.id });
  });

  it("propose_signal is available to advisory agents", async () => {
    const advisory = await seedAgent(world, { kind: "signal_generation", autonomy: "advisory", name: "Advisory signals" });
    ctx = toolContextFor(world, advisory, run, world.users.admin);
    expect((await invoke("propose_signal", signalInput)).ok).toBe(true);
  });

  it("propose_signal rejects unknown and untradable instruments", async () => {
    expect(await invoke("propose_signal", { ...signalInput, instrumentId: "ins_nope" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await world.repos.instruments.update("ins_btc", { tradable: false });
    expect(await invoke("propose_signal", { ...signalInput, instrumentId: "ins_btc" })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("request_hedge creates a HEDGE signal sized from the live quote", async () => {
    const out = await ok("request_hedge", {
      instrumentId: "ins_aapl",
      side: "SELL",
      notional: 1_000_000,
      rationale: "Gross exposure is 10% above the limit; halve the largest position.",
    });
    expect(out).toMatchObject({ direction: "HEDGE", side: "SELL", suggestedNotional: 1_000_000, suggestedQuantity: 5_000 });
    const stored = await world.repos.signals.findById(String(out.signalId));
    expect(stored?.direction).toBe("HEDGE");
    expect(stored?.factors[0].factor).toBe("risk_reduction");
  });

  it("submit_order goes through submitForAgent with agent origin and run linkage", async () => {
    const out = await ok("submit_order", {
      instrumentId: "ins_aapl",
      side: "BUY",
      type: "LIMIT",
      quantity: 100,
      limitPrice: 199,
      signalId: "sig_x",
      rationale: "Executing PM-approved signal sig_x on AAPL.",
    });
    expect(out).toMatchObject({ status: "FILLED", symbol: "AAPL", side: "BUY", quantity: 100, signalId: "sig_x", rejectionReason: null });
    expect(Array.isArray(out.riskChecks)).toBe(true);
    expect(ctx.created.orderIds).toEqual([out.orderId]);

    const call = world.orders.calls[0];
    expect(call.via).toBe("agent");
    expect(call.input).toMatchObject({ origin: "agent", agentRunId: run.id, portfolioId: world.portfolio.id });
  });

  it("submit_order reports a risk rejection as a result, not an error", async () => {
    world.orders.outcome = { status: "RISK_REJECTED", rejectionReason: "Single-name concentration exceeded" };
    const out = await ok("submit_order", { instrumentId: "ins_aapl", side: "BUY", quantity: 100, rationale: "Executing sig_x." });
    expect(out).toMatchObject({ status: "RISK_REJECTED", rejectionReason: "Single-name concentration exceeded" });
  });

  it("cancel_order cancels through the order service", async () => {
    const order = await world.repos.orders.create(makeOrder({ portfolioId: world.portfolio.id, status: "ROUTED" }));
    const out = await ok("cancel_order", { orderId: order.id, reason: "Superseded by a fresh signal" });
    expect(out).toMatchObject({ orderId: order.id, status: "CANCELLED", rejectionReason: "Superseded by a fresh signal" });
  });

  it("flag_compliance_issue records a warning breach and an audit event", async () => {
    const compliance = await seedAgent(world, { kind: "compliance", autonomy: "advisory", name: "Compliance" });
    ctx = toolContextFor(world, compliance, run, world.users.admin);
    const out = await ok("flag_compliance_issue", {
      subjectType: "order",
      subjectId: "ord_123",
      policy: "agent-orders-require-rationale",
      severity: "critical",
      description: "Agent order ord_123 on AAPL carries no rationale.",
    });
    const breach = await world.repos.riskBreaches.findById(String(out.breachId));
    expect(breach).toMatchObject({ severity: "warning", status: "open", portfolioId: world.portfolio.id });
    expect(breach?.message).toContain("agent-orders-require-rationale");
    const audit = await world.repos.audit.list({ action: "risk.breach_detected" }, { limit: 5, offset: 0 });
    expect(audit.items[0]).toMatchObject({ targetType: "order", targetId: "ord_123" });
  });

  it("flag_compliance_issue is closed to kinds that do not police the desk", async () => {
    expect(
      await invoke("flag_compliance_issue", { subjectType: "order", subjectId: "ord_1", policy: "p", description: "d" }),
    ).toMatchObject({ ok: false, code: "TOOL_KIND_FORBIDDEN" });
  });

  it("summarize_run echoes the summary and backfills the ids created this run", async () => {
    ctx.created.signalIds.push("sig_a");
    const out = await ok("summarize_run", { summary: "Two signals proposed, one order filled.", findings: ["Momentum intact"] });
    expect(out).toMatchObject({ runId: run.id, summary: "Two signals proposed, one order filled.", signalIds: ["sig_a"], orderIds: [] });
  });
});
