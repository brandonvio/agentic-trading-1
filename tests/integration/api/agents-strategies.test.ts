import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, expectPaged, type ApiWorld } from "./helpers";
import type { Agent, AgentRun, AgentStep } from "@/lib/domain/agent";
import type { Strategy, Backtest } from "@/lib/domain/strategy";
import { GET as listAgents, POST as createAgent } from "@/app/api/agents/route";
import { GET as getAgent, PATCH as patchAgent } from "@/app/api/agents/[id]/route";
import { POST as runAgent } from "@/app/api/agents/[id]/run/route";
import { GET as usage } from "@/app/api/agents/usage/route";
import { GET as listRuns } from "@/app/api/agent-runs/route";
import { GET as getRun } from "@/app/api/agent-runs/[id]/route";
import { GET as getSteps } from "@/app/api/agent-runs/[id]/steps/route";
import { POST as killRun } from "@/app/api/agent-runs/[id]/kill/route";
import { POST as cycle } from "@/app/api/portfolios/[id]/cycle/route";
import { GET as listSignals } from "@/app/api/signals/route";
import { POST as dismissSignal } from "@/app/api/signals/[id]/dismiss/route";
import { POST as createStrategy } from "@/app/api/strategies/route";
import { GET as getStrategy, PATCH as patchStrategy } from "@/app/api/strategies/[id]/route";
import { POST as deployStrategy } from "@/app/api/strategies/[id]/deploy/route";
import { POST as pauseStrategy } from "@/app/api/strategies/[id]/pause/route";
import { POST as resumeStrategy } from "@/app/api/strategies/[id]/resume/route";
import { GET as listBacktests, POST as runBacktest } from "@/app/api/strategies/[id]/backtests/route";
import { GET as getBacktest } from "@/app/api/backtests/[id]/route";

let w: ApiWorld;
let pm: string;
let trader: string;
let quant: string;
let analyst: string;
beforeAll(async () => {
  w = await setupApiWorld();
  pm = await loginAs(w.users.pm.email);
  trader = await loginAs(w.users.trader.email);
  quant = await loginAs(w.users.quant.email);
  analyst = await loginAs(w.users.analyst.email);
});

describe("agents", () => {
  it("GET /api/agents/[id] and PATCH (agents:configure)", async () => {
    const one = await call<Agent>(getAgent, "GET", `/api/agents/${w.agent.id}`, { cookie: trader, params: { id: w.agent.id } });
    expect(one.status).toBe(200);
    expect(one.data.kind).toBe("market_intelligence");

    const denied = await call(patchAgent, "PATCH", `/api/agents/${w.agent.id}`, { cookie: trader, params: { id: w.agent.id }, body: { name: "x" } });
    expect(denied.status).toBe(403);

    const ok = await call<Agent>(patchAgent, "PATCH", `/api/agents/${w.agent.id}`, {
      cookie: pm,
      params: { id: w.agent.id },
      body: { description: "updated via api" },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.description).toBe("updated via api");
  });

  it("POST /api/agents creates an agent", async () => {
    const r = await call<Agent>(createAgent, "POST", "/api/agents", {
      cookie: pm,
      body: {
        kind: "risk_sentinel",
        name: "Sentinel",
        description: "Watches limits",
        status: "idle",
        autonomy: "advisory",
        model: "claude-fable-5-1",
        portfolioId: w.portfolio.id,
        deskId: w.desk.id,
        tools: [],
        schedule: { description: "every 15m", intervalMinutes: 15, enabled: false },
        ownerUserId: w.users.pm.id,
      },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.id).toMatch(/^agt_/);
    const list = await call(listAgents, "GET", `/api/agents?portfolioId=${w.portfolio.id}&kind=risk_sentinel`, { cookie: pm });
    expectPaged(list.data);
    expect(list.data.items.map((a) => (a as Agent).id)).toContain(r.data.id);
  });

  it("POST /api/agents/[id]/run returns a finished run with steps (agents:run)", async () => {
    const denied = await call(runAgent, "POST", `/api/agents/${w.agent.id}/run`, { cookie: analyst, params: { id: w.agent.id }, body: {} });
    expect(denied.status).toBe(403);

    const r = await call<AgentRun>(runAgent, "POST", `/api/agents/${w.agent.id}/run`, {
      cookie: trader,
      params: { id: w.agent.id },
      body: { objective: "Summarise the macro backdrop", input: { instrumentIds: [w.instruments.aapl.id] } },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.id).toMatch(/^run_/);
    expect(r.data.agentId).toBe(w.agent.id);
    expect(r.data.trigger).toBe("manual");
    expect(r.data.triggeredBy).toMatchObject({ kind: "user", id: w.users.trader.id });
    expect(r.data.objective).toBe("Summarise the macro backdrop");
    expect(["succeeded", "failed", "killed", "budget_exhausted", "running", "queued"]).toContain(r.data.status);

    const fetched = await call<AgentRun>(getRun, "GET", `/api/agent-runs/${r.data.id}`, { cookie: trader, params: { id: r.data.id } });
    expect(fetched.status).toBe(200);
    expect(fetched.data.id).toBe(r.data.id);

    const steps = await call<AgentStep[]>(getSteps, "GET", `/api/agent-runs/${r.data.id}/steps`, { cookie: trader, params: { id: r.data.id } });
    expect(steps.status).toBe(200);
    expect(Array.isArray(steps.data)).toBe(true);
    for (const s of steps.data) expect(s.runId).toBe(r.data.id);

    const runs = await call(listRuns, "GET", `/api/agent-runs?agentId=${w.agent.id}`, { cookie: trader });
    expectPaged(runs.data);
    expect(runs.data.items.map((x) => (x as AgentRun).id)).toContain(r.data.id);

    // Killing a finished run: either accepted (200) or invalid state (409); never a 500.
    const killed = await call(killRun, "POST", `/api/agent-runs/${r.data.id}/kill`, { cookie: pm, params: { id: r.data.id }, body: { reason: "test" } });
    expect([200, 409]).toContain(killed.status);
  });

  it("GET /api/agents/usage aggregates stats", async () => {
    const r = await call<{ runsTotal: number; byKind: unknown[] }>(usage, "GET", "/api/agents/usage", { cookie: pm });
    expect(r.status).toBe(200);
    expect(r.data.runsTotal).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(r.data.byKind)).toBe(true);
  });

  it("POST /api/portfolios/[id]/cycle orchestrates the pipeline", async () => {
    const r = await call<{ runs: AgentRun[]; signals: unknown[]; orders: unknown[] }>(cycle, "POST", `/api/portfolios/${w.portfolio.id}/cycle`, {
      cookie: pm,
      params: { id: w.portfolio.id },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(Array.isArray(r.data.runs)).toBe(true);
    expect(Array.isArray(r.data.signals)).toBe(true);
    expect(Array.isArray(r.data.orders)).toBe(true);
  });

  it("signals can be listed and dismissed", async () => {
    const list = await call(listSignals, "GET", `/api/signals?status=new`, { cookie: pm });
    expect(list.status).toBe(200);
    expectPaged(list.data);
    const first = list.data.items[0] as { id: string } | undefined;
    if (first) {
      const r = await call<{ status: string }>(dismissSignal, "POST", `/api/signals/${first.id}/dismiss`, {
        cookie: pm,
        params: { id: first.id },
        body: { reason: "not now" },
      });
      expect(r.status).toBe(200);
      expect(r.data.status).toBe("dismissed");
    }
    expect((await call(dismissSignal, "POST", "/api/signals/sig_x/dismiss", { cookie: pm, params: { id: "sig_x" }, body: { reason: "x" } })).status).toBe(404);
  });
});

describe("strategies", () => {
  it("create (quant) → get → patch → deploy paper → pause → resume", async () => {
    const created = await call<Strategy>(createStrategy, "POST", "/api/strategies", {
      cookie: quant,
      body: {
        code: "VOLARB-1",
        name: "Index vol arb",
        description: "Sell rich index vol",
        thesis: "Implied vol persistently exceeds realised vol on index options.",
        style: "volatility_arbitrage",
        assetClasses: ["option"],
        instrumentIds: [],
        status: "research",
        ownerUserId: w.users.quant.id,
        deskId: w.desk.id,
        parameters: { targetVega: 1000 },
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    expect(created.data.id).toMatch(/^strat_/);
    expect(created.data.version).toBe(1);

    const one = await call<Strategy>(getStrategy, "GET", `/api/strategies/${created.data.id}`, { cookie: analyst, params: { id: created.data.id } });
    expect(one.status).toBe(200);

    const patched = await call<Strategy>(patchStrategy, "PATCH", `/api/strategies/${created.data.id}`, {
      cookie: quant,
      params: { id: created.data.id },
      body: { parameters: { targetVega: 2000 } },
    });
    expect(patched.status).toBe(200);
    expect(patched.data.parameters.targetVega).toBe(2000);

    const deniedDeploy = await call(deployStrategy, "POST", `/api/strategies/${created.data.id}/deploy`, {
      cookie: quant,
      params: { id: created.data.id },
      body: { portfolioId: w.portfolio.id, allocatedCapital: 1_000_000, mode: "paper" },
    });
    expect(deniedDeploy.status).toBe(403);

    const deployed = await call<{ strategy: Strategy; approval: unknown }>(deployStrategy, "POST", `/api/strategies/${created.data.id}/deploy`, {
      cookie: pm,
      params: { id: created.data.id },
      body: { portfolioId: w.portfolio.id, allocatedCapital: 1_000_000, mode: "paper" },
    });
    expect(deployed.status, JSON.stringify(deployed.json)).toBe(200);
    expect(deployed.data.strategy.deployments.map((d) => d.portfolioId)).toContain(w.portfolio.id);

    const paused = await call<Strategy>(pauseStrategy, "POST", `/api/strategies/${created.data.id}/pause`, {
      cookie: pm,
      params: { id: created.data.id },
      body: { reason: "regime change" },
    });
    expect(paused.status).toBe(200);
    expect(paused.data.status).toBe("paused");

    const resumed = await call<Strategy>(resumeStrategy, "POST", `/api/strategies/${created.data.id}/resume`, { cookie: pm, params: { id: created.data.id } });
    expect(resumed.status).toBe(200);
    expect(resumed.data.status).not.toBe("paused");
  });

  it("backtests: run (research:backtest) → list → get", async () => {
    const denied = await call(runBacktest, "POST", `/api/strategies/${w.strategy.id}/backtests`, {
      cookie: trader,
      params: { id: w.strategy.id },
      body: { from: "2025-01-01", to: "2025-12-31", initialCapital: 1_000_000 },
    });
    expect(denied.status).toBe(403);

    const bt = await call<Backtest>(runBacktest, "POST", `/api/strategies/${w.strategy.id}/backtests`, {
      cookie: quant,
      params: { id: w.strategy.id },
      body: { from: "2025-01-01", to: "2025-12-31", initialCapital: 1_000_000 },
    });
    expect(bt.status, JSON.stringify(bt.json)).toBe(200);
    expect(bt.data.id).toMatch(/^bt_/);
    expect(bt.data.strategyId).toBe(w.strategy.id);
    expect(bt.data.requestedByUserId).toBe(w.users.quant.id);

    const list = await call(listBacktests, "GET", `/api/strategies/${w.strategy.id}/backtests`, { cookie: analyst, params: { id: w.strategy.id } });
    expect(list.status).toBe(200);
    expectPaged(list.data);
    expect(list.data.items.map((b) => (b as Backtest).id)).toContain(bt.data.id);

    const one = await call<Backtest>(getBacktest, "GET", `/api/backtests/${bt.data.id}`, { cookie: analyst, params: { id: bt.data.id } });
    expect(one.status).toBe(200);
    expect(one.data.id).toBe(bt.data.id);

    const bad = await call(runBacktest, "POST", `/api/strategies/${w.strategy.id}/backtests`, {
      cookie: quant,
      params: { id: w.strategy.id },
      body: { from: "2025-01-01" },
    });
    expect(bad.status).toBe(400);
  });
});
