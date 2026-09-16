/**
 * Contract tests for the in-memory repositories. These assert the behaviour
 * every repository implementation must share (paging envelope, filtering,
 * ordering, not-found semantics, snapshot isolation), so the same suite can be
 * pointed at the Neo4j implementations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryRepositories, type InMemoryRepositories } from "@/lib/repositories/memory";
import { NotFoundError } from "@/lib/core/errors";
import {
  resetFixtureIds,
  makeUser,
  makeDesk,
  makePortfolio,
  makeInstrument,
  makeOrder,
  makePosition,
  makeAgent,
  makeAgentRun,
  makeAgentStep,
  makeSignal,
  makeRiskLimit,
  makeApproval,
  makeAuditEvent,
  makeBar,
  makeFill,
  buildAllRoles,
  T0,
} from "@/tests/fixtures/entities";

let repos: InMemoryRepositories;
const PAGE = { limit: 50, offset: 0 };

beforeEach(async () => {
  resetFixtureIds("mem");
  repos = createInMemoryRepositories();
});

describe("paging envelope", () => {
  it("reports total independently of the page window", async () => {
    for (let i = 0; i < 12; i++) {
      await repos.instruments.create(makeInstrument({ id: `ins_${i}`, symbol: `SYM${String(i).padStart(2, "0")}` }));
    }
    const page = await repos.instruments.list({}, { limit: 5, offset: 5 });
    expect(page.total).toBe(12);
    expect(page.items).toHaveLength(5);
    expect(page.limit).toBe(5);
    expect(page.offset).toBe(5);
  });

  it("returns an empty page past the end without failing", async () => {
    await repos.instruments.create(makeInstrument({ id: "ins_only" }));
    const page = await repos.instruments.list({}, { limit: 10, offset: 100 });
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(1);
  });
});

describe("snapshot isolation", () => {
  it("does not let callers mutate stored entities through returned objects", async () => {
    const created = await repos.portfolios.create(makePortfolio({ id: "pf_1", cash: 1000 }));
    created.cash = 999_999;
    const reloaded = await repos.portfolios.findById("pf_1");
    expect(reloaded?.cash).toBe(1000);
  });

  it("deep-clones nested objects", async () => {
    const created = await repos.portfolios.create(makePortfolio({ id: "pf_2" }));
    created.mandate.maxGrossLeverage = 99;
    const reloaded = await repos.portfolios.findById("pf_2");
    expect(reloaded?.mandate.maxGrossLeverage).not.toBe(99);
  });
});

describe("not-found semantics", () => {
  it("resolves find* to null and throws from update", async () => {
    expect(await repos.orders.findById("ord_nope")).toBeNull();
    expect(await repos.users.findByEmail("nobody@example.com")).toBeNull();
    await expect(repos.orders.update("ord_nope", { status: "CANCELLED" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(repos.users.delete("usr_nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UserRepository", () => {
  it("finds by email and filters by desk and role", async () => {
    await repos.users.create(makeUser({ id: "usr_a", email: "a@x.io", name: "Alpha", roles: ["trader"], deskIds: ["desk_1"] }));
    await repos.users.create(makeUser({ id: "usr_b", email: "b@x.io", name: "Bravo", roles: ["risk_manager"], deskIds: ["desk_2"] }));

    expect((await repos.users.findByEmail("a@x.io"))?.id).toBe("usr_a");
    expect((await repos.users.list({ deskId: "desk_2" }, PAGE)).total).toBe(1);
    expect((await repos.users.list({ role: "trader" }, PAGE)).items[0].id).toBe("usr_a");
  });

  it("orders users by name", async () => {
    await repos.users.create(makeUser({ id: "usr_z", email: "z@x.io", name: "Zeta" }));
    await repos.users.create(makeUser({ id: "usr_m", email: "m@x.io", name: "Mike" }));
    await repos.users.create(makeUser({ id: "usr_a", email: "a2@x.io", name: "Aaron" }));
    const names = (await repos.users.list({}, PAGE)).items.map((u) => u.name);
    expect(names).toEqual(["Aaron", "Mike", "Zeta"]);
  });
});

describe("RoleRepository", () => {
  it("upserts idempotently and finds by key", async () => {
    for (const role of buildAllRoles()) await repos.roles.upsert(role);
    const before = (await repos.roles.list()).length;
    await repos.roles.upsert(buildAllRoles()[0]);
    expect((await repos.roles.list()).length).toBe(before);
    expect((await repos.roles.findByKey("global_admin"))?.permissions.length).toBeGreaterThan(20);
  });
});

describe("PortfolioRepository", () => {
  it("filters by a set of desks and by status", async () => {
    await repos.portfolios.create(makePortfolio({ id: "pf_a", deskId: "desk_1", code: "A", status: "active" }));
    await repos.portfolios.create(makePortfolio({ id: "pf_b", deskId: "desk_2", code: "B", status: "frozen" }));
    await repos.portfolios.create(makePortfolio({ id: "pf_c", deskId: "desk_3", code: "C", status: "active" }));

    expect((await repos.portfolios.list({ deskIds: ["desk_1", "desk_3"] }, PAGE)).total).toBe(2);
    expect((await repos.portfolios.list({ status: "frozen" }, PAGE)).items[0].id).toBe("pf_b");
    expect((await repos.portfolios.findByCode("C"))?.id).toBe("pf_c");
  });
});

describe("PositionRepository", () => {
  it("distinguishes open from closed positions", async () => {
    await repos.positions.create(makePosition({ id: "pos_open", portfolioId: "pf_1", instrumentId: "ins_1", closedAt: null }));
    await repos.positions.create(makePosition({ id: "pos_closed", portfolioId: "pf_1", instrumentId: "ins_2", closedAt: T0 }));

    expect(await repos.positions.findOpen("pf_1", "ins_1")).not.toBeNull();
    expect(await repos.positions.findOpen("pf_1", "ins_2")).toBeNull();
    expect((await repos.positions.list({ portfolioId: "pf_1", open: true }, PAGE)).total).toBe(1);
    expect((await repos.positions.list({ portfolioId: "pf_1" }, PAGE)).total).toBe(2);
  });
});

describe("OrderRepository", () => {
  it("filters by status, statuses and portfolio set", async () => {
    await repos.orders.create(makeOrder({ id: "ord_1", portfolioId: "pf_1", status: "FILLED" }));
    await repos.orders.create(makeOrder({ id: "ord_2", portfolioId: "pf_1", status: "CANCELLED" }));
    await repos.orders.create(makeOrder({ id: "ord_3", portfolioId: "pf_2", status: "FILLED" }));

    expect((await repos.orders.list({ status: "FILLED" }, PAGE)).total).toBe(2);
    expect((await repos.orders.list({ statuses: ["FILLED", "CANCELLED"] }, PAGE)).total).toBe(3);
    expect((await repos.orders.list({ portfolioIds: ["pf_2"] }, PAGE)).total).toBe(1);
  });

  it("sums agent notional since a cutoff", async () => {
    await repos.orders.create(makeOrder({ id: "ord_old", portfolioId: "pf_1", origin: "agent", estimatedNotional: 100, createdAt: "2026-08-01T00:00:00.000Z" }));
    await repos.orders.create(makeOrder({ id: "ord_new", portfolioId: "pf_1", origin: "agent", estimatedNotional: 250, createdAt: "2026-09-02T00:00:00.000Z" }));
    await repos.orders.create(makeOrder({ id: "ord_manual", portfolioId: "pf_1", origin: "manual", estimatedNotional: 900, createdAt: "2026-09-02T00:00:00.000Z" }));

    expect(await repos.orders.sumAgentNotionalSince("pf_1", "2026-09-01T00:00:00.000Z")).toBe(250);
  });

  it("counts by status", async () => {
    await repos.orders.create(makeOrder({ id: "ord_a", portfolioId: "pf_1", status: "ACKNOWLEDGED" }));
    await repos.orders.create(makeOrder({ id: "ord_b", portfolioId: "pf_1", status: "PARTIALLY_FILLED" }));
    await repos.orders.create(makeOrder({ id: "ord_c", portfolioId: "pf_1", status: "FILLED" }));
    expect(await repos.orders.countByStatus("pf_1", ["ACKNOWLEDGED", "PARTIALLY_FILLED"])).toBe(2);
  });

  it("returns newest orders first", async () => {
    await repos.orders.create(makeOrder({ id: "ord_old", createdAt: "2026-09-01T00:00:00.000Z" }));
    await repos.orders.create(makeOrder({ id: "ord_new", createdAt: "2026-09-03T00:00:00.000Z" }));
    expect((await repos.orders.list({}, PAGE)).items[0].id).toBe("ord_new");
  });
});

describe("FillRepository", () => {
  it("lists fills for an order", async () => {
    await repos.fills.create(makeFill({ id: "fill_1", orderId: "ord_1", portfolioId: "pf_1" }));
    await repos.fills.create(makeFill({ id: "fill_2", orderId: "ord_1", portfolioId: "pf_1" }));
    await repos.fills.create(makeFill({ id: "fill_3", orderId: "ord_2", portfolioId: "pf_1" }));
    expect(await repos.fills.listByOrder("ord_1")).toHaveLength(2);
  });
});

describe("BarRepository", () => {
  it("stores and returns bars ascending by time, honouring limit as most-recent", async () => {
    const bars = Array.from({ length: 10 }, (_, i) =>
      makeBar({ instrumentId: "ins_1", time: new Date(Date.parse("2026-09-01T00:00:00.000Z") + i * 86_400_000).toISOString(), close: 100 + i }),
    );
    expect(await repos.bars.createMany("1d", bars)).toBe(10);

    const all = await repos.bars.list("ins_1", "1d", {});
    expect(all).toHaveLength(10);
    for (let i = 1; i < all.length; i++) expect(Date.parse(all[i].time)).toBeGreaterThan(Date.parse(all[i - 1].time));

    const recent = await repos.bars.list("ins_1", "1d", { limit: 3 });
    expect(recent).toHaveLength(3);
    expect(recent[2].close).toBe(109);
    expect(Date.parse(recent[0].time)).toBeLessThan(Date.parse(recent[2].time));
  });

  it("keeps intervals separate and is idempotent on re-insert", async () => {
    const bar = makeBar({ instrumentId: "ins_1", time: "2026-09-01T00:00:00.000Z" });
    await repos.bars.createMany("1d", [bar]);
    await repos.bars.createMany("1d", [bar]);
    await repos.bars.createMany("1h", [bar]);
    expect(await repos.bars.list("ins_1", "1d", {})).toHaveLength(1);
    expect(await repos.bars.list("ins_1", "1h", {})).toHaveLength(1);
  });
});

describe("AgentRepository and runs", () => {
  it("includes global agents when asked", async () => {
    await repos.agents.create(makeAgent({ id: "agt_global", portfolioId: null, kind: "market_intelligence" }));
    await repos.agents.create(makeAgent({ id: "agt_scoped", portfolioId: "pf_1", kind: "execution" }));

    expect((await repos.agents.list({ portfolioId: "pf_1" }, PAGE)).total).toBe(1);
    expect((await repos.agents.list({ portfolioId: "pf_1", includeGlobal: true }, PAGE)).total).toBe(2);
    expect((await repos.agents.list({ kind: "execution" }, PAGE)).total).toBe(1);
  });

  it("keeps agent steps ordered by index", async () => {
    await repos.agentRuns.create(makeAgentRun({ id: "run_1", agentId: "agt_1" }));
    for (const i of [2, 0, 1]) {
      await repos.agentRuns.appendStep(makeAgentStep({ id: `step_${i}`, runId: "run_1", index: i, content: `step ${i}` }));
    }
    const steps = await repos.agentRuns.listSteps("run_1");
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });
});

describe("SignalRepository", () => {
  it("filters by status and source", async () => {
    await repos.signals.create(makeSignal({ id: "sig_1", status: "new", agentId: "agt_1", portfolioId: "pf_1" }));
    await repos.signals.create(makeSignal({ id: "sig_2", status: "acted", agentId: "agt_1", portfolioId: "pf_1" }));
    await repos.signals.create(makeSignal({ id: "sig_3", status: "new", agentId: "agt_2", portfolioId: "pf_2" }));

    expect((await repos.signals.list({ status: "new" }, PAGE)).total).toBe(2);
    expect((await repos.signals.list({ agentId: "agt_1" }, PAGE)).total).toBe(2);
    expect((await repos.signals.list({ portfolioIds: ["pf_2"] }, PAGE)).total).toBe(1);
  });
});

describe("RiskLimitRepository.listApplicable", () => {
  it("returns platform, desk, portfolio, strategy and agent limits, excluding disabled and unrelated ones", async () => {
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_platform", scope: "platform", scopeId: null, enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_desk", scope: "desk", scopeId: "desk_1", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_pf", scope: "portfolio", scopeId: "pf_1", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_strat", scope: "strategy", scopeId: "strat_1", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_agent", scope: "agent", scopeId: "agt_1", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_other_desk", scope: "desk", scopeId: "desk_9", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_disabled", scope: "platform", scopeId: null, enabled: false }));

    const ids = (await repos.riskLimits.listApplicable({ portfolioId: "pf_1", deskId: "desk_1", strategyId: "strat_1", agentId: "agt_1" })).map((l) => l.id);
    expect(ids.sort()).toEqual(["lim_agent", "lim_desk", "lim_pf", "lim_platform", "lim_strat"]);
  });

  it("omits strategy and agent limits when those ids are absent", async () => {
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_strat", scope: "strategy", scopeId: "strat_1", enabled: true }));
    await repos.riskLimits.create(makeRiskLimit({ id: "lim_platform", scope: "platform", scopeId: null, enabled: true }));
    const ids = (await repos.riskLimits.listApplicable({ portfolioId: "pf_1", deskId: "desk_1" })).map((l) => l.id);
    expect(ids).toEqual(["lim_platform"]);
  });
});

describe("ApprovalRepository", () => {
  it("finds the pending approval for a subject", async () => {
    await repos.approvals.create(makeApproval({ id: "apr_done", subjectId: "ord_1", status: "approved" }));
    await repos.approvals.create(makeApproval({ id: "apr_pending", subjectId: "ord_1", status: "pending" }));
    expect((await repos.approvals.findPendingBySubject("ord_1"))?.id).toBe("apr_pending");
    expect(await repos.approvals.findPendingBySubject("ord_missing")).toBeNull();
  });
});

describe("AuditRepository", () => {
  it("filters by action and date window and returns newest first", async () => {
    await repos.audit.create(makeAuditEvent({ id: "aud_1", action: "auth.login", at: "2026-09-01T00:00:00.000Z" }));
    await repos.audit.create(makeAuditEvent({ id: "aud_2", action: "order.created", at: "2026-09-02T00:00:00.000Z" }));
    await repos.audit.create(makeAuditEvent({ id: "aud_3", action: "order.filled", at: "2026-09-03T00:00:00.000Z" }));

    expect((await repos.audit.list({}, PAGE)).items[0].id).toBe("aud_3");
    expect((await repos.audit.list({ action: "auth.login" }, PAGE)).total).toBe(1);
    const windowed = await repos.audit.list({ from: "2026-09-02T00:00:00.000Z", to: "2026-09-02T23:59:59.000Z" }, PAGE);
    expect(windowed.items.map((e) => e.id)).toEqual(["aud_2"]);
  });

  it("bulk-creates events", async () => {
    const events = Array.from({ length: 5 }, (_, i) => makeAuditEvent({ id: `aud_b${i}`, at: `2026-09-0${i + 1}T00:00:00.000Z` }));
    expect(await repos.audit.createMany(events)).toBe(5);
    expect((await repos.audit.list({}, PAGE)).total).toBe(5);
  });
});

describe("RepositoryAdmin", () => {
  it("clears every table", async () => {
    await repos.desks.create(makeDesk({ id: "desk_1" }));
    await repos.orders.create(makeOrder({ id: "ord_1" }));
    await repos.bars.createMany("1d", [makeBar({ instrumentId: "ins_1" })]);
    await repos.admin.clearAll();
    expect((await repos.desks.list(PAGE)).total).toBe(0);
    expect((await repos.orders.list({}, PAGE)).total).toBe(0);
    expect(await repos.bars.list("ins_1", "1d", {})).toHaveLength(0);
  });
});
