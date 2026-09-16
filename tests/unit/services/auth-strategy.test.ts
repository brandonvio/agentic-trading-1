import { describe, it, expect, beforeEach } from "vitest";
import { createHarness, type Harness } from "./harness";
import { ConflictError, ForbiddenError, InvalidStateError, UnauthorizedError, ValidationError } from "@/lib/core/errors";
import { simulateBacktest, hashSeed } from "@/lib/services/helpers/backtest-sim";
import type { CreateStrategyInput } from "@/lib/domain/strategy";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

describe("AuthService", () => {
  it("issues a session for an active user and records the login", async () => {
    const result = await h.services.auth.login("trader@agenticprop.io", "10.0.0.1");
    expect(result.user.id).toBe(h.users.trader.id);
    expect(result.principal.permissions).toContain("orders:create");
    expect(result.token).toContain(".");
    expect(result.expiresAt).toBeGreaterThan(h.clock.now().getTime());

    const events = await h.repos.audit.list({ action: "auth.login" }, { limit: 10, offset: 0 });
    expect(events.total).toBe(1);
  });

  it("rejects unknown and suspended users", async () => {
    await expect(h.services.auth.login("nobody@agenticprop.io")).rejects.toBeInstanceOf(UnauthorizedError);
    await h.repos.users.update(h.users.trader.id, { status: "suspended" });
    await expect(h.services.auth.login("trader@agenticprop.io")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("resolves a valid token back to a principal and refuses a bad one", async () => {
    const { token } = await h.services.auth.login("pm@agenticprop.io");
    const resolved = await h.services.auth.resolve(token);
    expect(resolved?.principal.userId).toBe(h.users.pm.id);
    expect(await h.services.auth.resolve("garbage")).toBeNull();
    expect(await h.services.auth.resolve(null)).toBeNull();
  });

  it("stops resolving a token once the user is suspended", async () => {
    const { token } = await h.services.auth.login("trader@agenticprop.io");
    await h.repos.users.update(h.users.trader.id, { status: "suspended" });
    expect(await h.services.auth.resolve(token)).toBeNull();
  });

  it("lists login candidates without leaking sensitive fields", async () => {
    const candidates = await h.services.auth.listLoginCandidates();
    expect(candidates.length).toBe(Object.keys(h.users).length);
    expect(candidates[0]).toHaveProperty("email");
    expect(candidates[0]).not.toHaveProperty("deskIds");
  });
});

describe("UserService", () => {
  it("requires users:manage to create and users:read to list", async () => {
    const input = { email: "new@agenticprop.io", name: "New Person", title: "Trader", roles: ["trader" as const], deskIds: [h.desk.id], status: "active" as const };
    await expect(h.services.users.create(h.principal("trader"), input)).rejects.toBeInstanceOf(ForbiddenError);
    const created = await h.services.users.create(h.principal("admin"), input);
    expect(created.email).toBe("new@agenticprop.io");

    await expect(h.services.users.list(h.principal("trader"), {}, { limit: 50, offset: 0 })).rejects.toBeInstanceOf(ForbiddenError);
    const listed = await h.services.users.list(h.principal("admin"), {}, { limit: 50, offset: 0 });
    expect(listed.total).toBeGreaterThan(0);
  });

  it("exposes the full role catalogue", async () => {
    const roles = await h.services.users.listRoles();
    expect(roles.map((r) => r.key)).toContain("global_admin");
    expect(roles.find((r) => r.key === "analyst")?.permissions.every((p) => p.endsWith(":read"))).toBe(true);
  });
});

describe("StrategyService", () => {
  const draft = (over: Partial<CreateStrategyInput> = {}): CreateStrategyInput => ({
    code: "GM-CARRY",
    name: "G10 FX Carry",
    description: "Long high-yielders against funders",
    thesis: "Rate differentials persist while volatility stays contained.",
    style: "carry",
    assetClasses: ["forex"],
    instrumentIds: [],
    status: "research",
    ownerUserId: h.users.quant.id,
    deskId: h.desk.id,
    parameters: { lookbackDays: 60, maxPairs: 6 },
    deployments: [],
    ...over,
  });

  it("creates a strategy and refuses duplicate codes", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    expect(created.version).toBe(1);
    expect(created.status).toBe("research");
    await expect(h.services.strategies.create(h.principal("quant"), draft())).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires strategies:create", async () => {
    await expect(h.services.strategies.create(h.principal("analyst"), draft())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("bumps the version only when parameters change", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const renamed = await h.services.strategies.update(h.principal("quant"), created.id, { name: "G10 Carry v2" });
    expect(renamed.version).toBe(1);
    const retuned = await h.services.strategies.update(h.principal("quant"), created.id, { parameters: { lookbackDays: 90, maxPairs: 6 } });
    expect(retuned.version).toBe(2);
  });

  it("deploys to paper immediately", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const { strategy, approval } = await h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 5_000_000, "paper");
    expect(approval).toBeNull();
    expect(strategy.status).toBe("paper");
    expect(strategy.deployments[0].allocatedCapital).toBe(5_000_000);
  });

  it("routes a live deployment through approval for a PM", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const { strategy, approval } = await h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 5_000_000, "live");
    expect(approval).not.toBeNull();
    expect(approval?.type).toBe("strategy_deploy");
    expect(strategy.status).toBe("research");

    await h.services.approvals.decide(h.principal("cio"), approval!.id, { decision: "approve", note: "sized appropriately" });
    const live = await h.repos.strategies.findById(created.id);
    expect(live?.status).toBe("live");
    expect(live?.deployments[0].allocatedCapital).toBe(5_000_000);
  });

  it("lets a risk-override principal deploy live directly", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const { strategy, approval } = await h.services.strategies.deploy(h.principal("cio"), created.id, h.portfolio.id, 1_000_000, "live");
    expect(approval).toBeNull();
    expect(strategy.status).toBe("live");
  });

  it("refuses deployment outside the portfolio mandate", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft({ code: "EQD-VOL", assetClasses: ["option"] }));
    await expect(h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 1_000_000, "paper")).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses non-positive capital and inactive portfolios", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    await expect(h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 0, "paper")).rejects.toBeInstanceOf(ValidationError);
    await h.repos.portfolios.update(h.portfolio.id, { status: "frozen" });
    await expect(h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 1000, "paper")).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("pauses and resumes", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    await h.services.strategies.deploy(h.principal("pm"), created.id, h.portfolio.id, 1_000_000, "paper");
    const paused = await h.services.strategies.pause(h.principal("risk"), created.id, "drawdown breach");
    expect(paused.status).toBe("paused");
    const resumed = await h.services.strategies.resume(h.principal("pm"), created.id);
    expect(resumed.status).toBe("live");
  });

  it("runs a deterministic backtest and stamps the strategy", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const opts = { from: "2024-09-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z", initialCapital: 10_000_000 };

    const first = await h.services.strategies.runBacktest(h.principal("quant"), created.id, opts);
    expect(first.status).toBe("completed");
    expect(first.equityCurve.length).toBeGreaterThan(50);
    expect(first.stats?.tradeCount).toBeGreaterThan(0);
    expect(first.summary).toContain(created.name);

    const stamped = await h.repos.strategies.findById(created.id);
    expect(stamped?.status).toBe("backtested");
    expect(stamped?.backtest?.sharpe).toBe(first.stats?.sharpe);

    // Same inputs → identical curve.
    const second = await h.services.strategies.runBacktest(h.principal("quant"), created.id, opts);
    expect(second.equityCurve).toEqual(first.equityCurve);
  });

  it("requires research:backtest and a valid window", async () => {
    const created = await h.services.strategies.create(h.principal("quant"), draft());
    const opts = { from: "2024-09-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z", initialCapital: 1_000_000 };
    await expect(h.services.strategies.runBacktest(h.principal("trader"), created.id, opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      h.services.strategies.runBacktest(h.principal("quant"), created.id, { ...opts, from: opts.to, to: opts.from }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("backtest simulator", () => {
  it("is deterministic and respects OHLC-style invariants of the curve", () => {
    const args = { style: "momentum" as const, from: "2025-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z", initialCapital: 1_000_000, seed: hashSeed("a", "b") };
    const a = simulateBacktest(args);
    const b = simulateBacktest(args);
    expect(a).toEqual(b);
    expect(a.equityCurve[0][1]).toBe(1_000_000);
    expect(a.stats.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(a.equityCurve.every(([t]) => !Number.isNaN(Date.parse(t)))).toBe(true);
    for (let i = 1; i < a.equityCurve.length; i++) {
      expect(Date.parse(a.equityCurve[i][0])).toBeGreaterThan(Date.parse(a.equityCurve[i - 1][0]));
    }
  });

  it("produces different curves for different seeds", () => {
    const base = { style: "trend_following" as const, from: "2025-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z", initialCapital: 1_000_000 };
    const a = simulateBacktest({ ...base, seed: 1 });
    const b = simulateBacktest({ ...base, seed: 2 });
    expect(a.equityCurve).not.toEqual(b.equityCurve);
  });
});
