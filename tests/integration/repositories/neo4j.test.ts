/**
 * Neo4j repository integration tests against the `agenticproptest` database.
 *
 * These assert the same contract as tests/unit/repositories/memory.test.ts —
 * paging, filtering, ordering, not-found — plus the things only the graph
 * implementation can get wrong: JSON round-tripping of nested fields and the
 * relationships written alongside foreign-key properties.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useNeo4j, edgeTargets, countEdges, NOW } from "../helpers/neo4j";
import { clearDatabase, ensureSchema } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/core/errors";
import {
  resetFixtureIds,
  makeUser,
  makeDesk,
  makePortfolio,
  makeOrder,
  makeFill,
  makePosition,
  makeStrategy,
  makeAgent,
  makeAgentRun,
  makeAgentStep,
  makeSignal,
  makeRiskLimit,
  makeRiskBreach,
  makeApproval,
  makeAuditEvent,
  makeBar,
  makeBrokerAccount,
  buildAllRoles,
  buildOption,
  buildForex,
  buildCrypto,
  buildEvent,
  buildFuture,
  buildEquity,
} from "@/tests/fixtures/entities";

// eslint-disable-next-line react-hooks/rules-of-hooks -- vitest fixture helper, not a React hook
const h = useNeo4j();
const PAGE = { limit: 50, offset: 0 };

beforeEach(async () => {
  await clearDatabase(h.client);
  await ensureSchema(h.client);
  resetFixtureIds("n4j");
});

describe("schema", () => {
  it("creates uniqueness constraints and the static broker/permission nodes", async () => {
    const constraints = await h.client.read<{ name: string }>("SHOW CONSTRAINTS YIELD name RETURN name");
    expect(constraints.length).toBeGreaterThan(5);

    const brokers = await h.client.read<{ k: string }>("MATCH (b:Broker) RETURN b.key AS k ORDER BY k");
    expect(brokers.map((b) => b.k)).toEqual(["coinbase", "ibkr", "kalshi", "oanda", "tradovate"]);

    const perms = await h.client.readOne<{ c: number }>("MATCH (p:Permission) RETURN count(p) AS c");
    expect(Number(perms?.c)).toBeGreaterThan(20);
  });

  it("upserts by id rather than creating a duplicate node", async () => {
    // createNode MERGEs on id by design, which keeps seeding idempotent.
    await h.repos.desks.create(makeDesk({ id: "desk_dup", code: "DUP", name: "First" }));
    const second = await h.repos.desks.create(makeDesk({ id: "desk_dup", code: "DUP2", name: "Second" }));

    expect(second.name).toBe("Second");
    const row = await h.client.readOne<{ c: number }>("MATCH (d:Desk {id: $id}) RETURN count(d) AS c", { id: "desk_dup" });
    expect(Number(row?.c)).toBe(1);
  });
});

describe("UserRepository", () => {
  it("round-trips a user with its array fields and finds it by email", async () => {
    const user = makeUser({ id: "usr_1", email: "ada@agenticprop.io", name: "Ada", roles: ["trader", "quant_researcher"], deskIds: ["desk_a", "desk_b"] });
    const created = await h.repos.users.create(user);
    expect(created).toEqual(user);

    const found = await h.repos.users.findByEmail("ada@agenticprop.io");
    expect(found?.roles).toEqual(["trader", "quant_researcher"]);
    expect(found?.deskIds).toEqual(["desk_a", "desk_b"]);
  });

  it("writes HAS_ROLE and MEMBER_OF edges", async () => {
    for (const role of buildAllRoles()) await h.repos.roles.upsert(role);
    await h.repos.desks.create(makeDesk({ id: "desk_a", code: "A" }));
    await h.repos.users.create(makeUser({ id: "usr_e", email: "e@x.io", roles: ["trader"], deskIds: ["desk_a"] }));

    // edgeTargets prefers `id`, and Role nodes carry both `id` and `key`.
    expect(await edgeTargets(h.client, "User", "usr_e", "HAS_ROLE")).toEqual(["role_trader"]);
    expect(await edgeTargets(h.client, "User", "usr_e", "MEMBER_OF")).toEqual(["desk_a"]);
  });

  it("updates partially and throws for a missing id", async () => {
    await h.repos.users.create(makeUser({ id: "usr_u", email: "u@x.io", name: "Before" }));
    const updated = await h.repos.users.update("usr_u", { name: "After", status: "suspended" });
    expect(updated.name).toBe("After");
    expect(updated.status).toBe("suspended");
    expect(updated.email).toBe("u@x.io");
    await expect(h.repos.users.update("usr_missing", { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("orders by name and pages", async () => {
    for (const [i, name] of ["Zoe", "Adam", "Mia"].entries()) {
      await h.repos.users.create(makeUser({ id: `usr_o${i}`, email: `o${i}@x.io`, name }));
    }
    const page = await h.repos.users.list({}, { limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items.map((u) => u.name)).toEqual(["Adam", "Mia"]);
  });
});

describe("InstrumentRepository", () => {
  it("round-trips the discriminated details union for every asset class", async () => {
    const instruments = [buildEquity({ id: "i_eq" }), buildOption({ id: "i_opt" }), buildFuture({ id: "i_fut" }), buildForex({ id: "i_fx" }), buildCrypto({ id: "i_cr" }), buildEvent({ id: "i_ev" })];
    expect(await h.repos.instruments.createMany(instruments)).toBe(6);

    for (const original of instruments) {
      const found = await h.repos.instruments.findById(original.id);
      expect(found, original.id).toEqual(original);
    }

    const option = await h.repos.instruments.findById("i_opt");
    expect(option?.details).toMatchObject({ assetClass: "option", strike: 620, right: "CALL", underlyingSymbol: "SPY" });
    const event = await h.repos.instruments.findById("i_ev");
    expect(event?.details).toMatchObject({ assetClass: "event", settlementValue: 1 });
  });

  it("filters by asset class, broker and search, and finds by symbol", async () => {
    await h.repos.instruments.createMany([buildEquity({ id: "i_a", symbol: "AAPL", name: "Apple Inc." }), buildForex({ id: "i_f", symbol: "EUR/USD" }), buildCrypto({ id: "i_c", symbol: "BTC-USD" })]);

    expect((await h.repos.instruments.list({ assetClass: "forex" }, PAGE)).total).toBe(1);
    expect((await h.repos.instruments.list({ broker: "coinbase" }, PAGE)).total).toBe(1);
    expect((await h.repos.instruments.findBySymbol("EUR/USD"))?.id).toBe("i_f");
    const searched = await h.repos.instruments.list({ search: "AAPL" }, PAGE);
    expect(searched.items.map((i) => i.id)).toEqual(["i_a"]);
  });

  it("writes a TRADES_ON edge to the broker node", async () => {
    await h.repos.instruments.create(buildCrypto({ id: "i_btc" }));
    expect(await edgeTargets(h.client, "Instrument", "i_btc", "TRADES_ON")).toEqual(["coinbase"]);
  });
});

describe("PortfolioRepository", () => {
  it("round-trips the nested mandate object", async () => {
    const portfolio = makePortfolio({
      id: "pf_1",
      deskId: "desk_1",
      code: "GM-ALPHA",
      mandate: { assetClasses: ["forex", "crypto"], maxGrossLeverage: 4.5, maxConcentration: 0.18, agentTradingEnabled: false, agentApprovalThresholdNotional: 1_234_567 },
    });
    await h.repos.desks.create(makeDesk({ id: "desk_1", code: "D1" }));
    const created = await h.repos.portfolios.create(portfolio);
    expect(created).toEqual(portfolio);

    const found = await h.repos.portfolios.findById("pf_1");
    expect(found?.mandate.assetClasses).toEqual(["forex", "crypto"]);
    expect(found?.mandate.agentTradingEnabled).toBe(false);
    expect(found?.mandate.agentApprovalThresholdNotional).toBe(1_234_567);
  });

  it("filters by a set of desks and links to the desk", async () => {
    await h.repos.desks.create(makeDesk({ id: "desk_1", code: "D1" }));
    await h.repos.desks.create(makeDesk({ id: "desk_2", code: "D2" }));
    await h.repos.portfolios.create(makePortfolio({ id: "pf_a", deskId: "desk_1", code: "A" }));
    await h.repos.portfolios.create(makePortfolio({ id: "pf_b", deskId: "desk_2", code: "B" }));

    expect((await h.repos.portfolios.list({ deskIds: ["desk_1"] }, PAGE)).total).toBe(1);
    expect((await h.repos.portfolios.findByCode("B"))?.id).toBe("pf_b");
    expect(await edgeTargets(h.client, "Portfolio", "pf_a", "BELONGS_TO")).toEqual(["desk_1"]);
  });
});

describe("OrderRepository", () => {
  it("round-trips riskChecks and the createdBy actor", async () => {
    const order = makeOrder({
      id: "ord_1",
      portfolioId: "pf_1",
      createdBy: { kind: "agent", id: "agt_1", name: "Execution agent", runId: "run_1" },
      riskChecks: [
        { rule: "mandate:asset_class", passed: true, message: "permitted", observed: null, limit: null },
        { rule: "limit:order_notional", passed: false, message: "too large", observed: 5_000_000, limit: 1_000_000 },
      ],
    });
    const created = await h.repos.orders.create(order);
    expect(created).toEqual(order);

    const found = await h.repos.orders.findById("ord_1");
    expect(found?.riskChecks).toHaveLength(2);
    expect(found?.riskChecks[1]).toMatchObject({ passed: false, observed: 5_000_000, limit: 1_000_000 });
    expect(found?.createdBy).toMatchObject({ kind: "agent", runId: "run_1" });
  });

  it("filters by status, statuses and portfolio set, newest first", async () => {
    await h.repos.orders.create(makeOrder({ id: "ord_old", portfolioId: "pf_1", status: "FILLED", createdAt: "2026-09-01T00:00:00.000Z" }));
    await h.repos.orders.create(makeOrder({ id: "ord_new", portfolioId: "pf_1", status: "CANCELLED", createdAt: "2026-09-03T00:00:00.000Z" }));
    await h.repos.orders.create(makeOrder({ id: "ord_other", portfolioId: "pf_2", status: "FILLED", createdAt: "2026-09-02T00:00:00.000Z" }));

    expect((await h.repos.orders.list({}, PAGE)).items[0].id).toBe("ord_new");
    expect((await h.repos.orders.list({ status: "FILLED" }, PAGE)).total).toBe(2);
    expect((await h.repos.orders.list({ statuses: ["FILLED", "CANCELLED"] }, PAGE)).total).toBe(3);
    expect((await h.repos.orders.list({ portfolioIds: ["pf_2"] }, PAGE)).total).toBe(1);
  });

  it("sums agent notional since a cutoff and counts by status", async () => {
    await h.repos.orders.create(makeOrder({ id: "o1", portfolioId: "pf_1", origin: "agent", estimatedNotional: 100, createdAt: "2026-08-01T00:00:00.000Z" }));
    await h.repos.orders.create(makeOrder({ id: "o2", portfolioId: "pf_1", origin: "agent", estimatedNotional: 250, createdAt: "2026-09-02T00:00:00.000Z" }));
    await h.repos.orders.create(makeOrder({ id: "o3", portfolioId: "pf_1", origin: "manual", estimatedNotional: 999, createdAt: "2026-09-02T00:00:00.000Z" }));
    await h.repos.orders.create(makeOrder({ id: "o4", portfolioId: "pf_1", status: "ACKNOWLEDGED" }));

    expect(await h.repos.orders.sumAgentNotionalSince("pf_1", "2026-09-01T00:00:00.000Z")).toBe(250);
    expect(await h.repos.orders.countByStatus("pf_1", ["ACKNOWLEDGED"])).toBe(1);
  });

  it("lists fills for an order", async () => {
    await h.repos.orders.create(makeOrder({ id: "ord_f", portfolioId: "pf_1" }));
    await h.repos.fills.create(makeFill({ id: "fill_1", orderId: "ord_f", portfolioId: "pf_1", quantity: 50, price: 101 }));
    await h.repos.fills.create(makeFill({ id: "fill_2", orderId: "ord_f", portfolioId: "pf_1", quantity: 50, price: 102 }));

    const fills = await h.repos.fills.listByOrder("ord_f");
    expect(fills).toHaveLength(2);
    expect(await countEdges(h.client, "Fill", "fill_1", "FILLS")).toBe(1);
  });
});

describe("PositionRepository", () => {
  it("separates open from closed and round-trips signed quantities", async () => {
    await h.repos.positions.create(makePosition({ id: "pos_long", portfolioId: "pf_1", instrumentId: "ins_1", quantity: 100, closedAt: null }));
    await h.repos.positions.create(makePosition({ id: "pos_short", portfolioId: "pf_1", instrumentId: "ins_2", quantity: -250, marketValue: -25_000, closedAt: null }));
    await h.repos.positions.create(makePosition({ id: "pos_done", portfolioId: "pf_1", instrumentId: "ins_3", quantity: 0, closedAt: NOW }));

    expect((await h.repos.positions.findOpen("pf_1", "ins_2"))?.quantity).toBe(-250);
    expect(await h.repos.positions.findOpen("pf_1", "ins_3")).toBeNull();
    expect((await h.repos.positions.list({ portfolioId: "pf_1", open: true }, PAGE)).total).toBe(2);
    expect((await h.repos.positions.list({ portfolioId: "pf_1" }, PAGE)).total).toBe(3);
  });
});

describe("StrategyRepository", () => {
  it("round-trips deployments, parameters and performance stats", async () => {
    const strategy = makeStrategy({
      id: "strat_1",
      code: "VOL-RP",
      deskId: "desk_1",
      parameters: { lookback: 30, threshold: 1.5, enabled: true, mode: "aggressive" },
      deployments: [
        { portfolioId: "pf_1", allocatedCapital: 5_000_000, deployedAt: NOW },
        { portfolioId: "pf_2", allocatedCapital: 2_500_000, deployedAt: NOW },
      ],
      backtest: { sharpe: 1.82, sortino: 2.4, annualizedReturnPct: 18.2, maxDrawdownPct: 9.1, winRatePct: 61, profitFactor: 1.7, tradeCount: 412, asOf: NOW },
    });
    const created = await h.repos.strategies.create(strategy);
    expect(created).toEqual(strategy);

    const found = await h.repos.strategies.findById("strat_1");
    expect(found?.deployments).toHaveLength(2);
    expect(found?.parameters).toEqual({ lookback: 30, threshold: 1.5, enabled: true, mode: "aggressive" });
    expect(found?.backtest?.sharpe).toBe(1.82);
  });

  it("filters by the portfolio it is deployed to", async () => {
    await h.repos.strategies.create(makeStrategy({ id: "s_1", code: "S1", deployments: [{ portfolioId: "pf_1", allocatedCapital: 1, deployedAt: NOW }] }));
    await h.repos.strategies.create(makeStrategy({ id: "s_2", code: "S2", deployments: [{ portfolioId: "pf_2", allocatedCapital: 1, deployedAt: NOW }] }));
    const page = await h.repos.strategies.list({ portfolioId: "pf_1" }, PAGE);
    expect(page.items.map((s) => s.id)).toEqual(["s_1"]);
  });
});

describe("AgentRepository and runs", () => {
  it("round-trips tools, guardrails and the schedule, and includes global agents", async () => {
    const agent = makeAgent({
      id: "agt_g",
      portfolioId: null,
      kind: "market_intelligence",
      tools: ["get_market_overview", "get_quotes", "summarize_run"],
      guardrails: ["Never fabricate a data point", "Cite every factor"],
      schedule: { description: "every 15m during RTH", intervalMinutes: 15, enabled: true },
    });
    await h.repos.agents.create(agent);
    await h.repos.agents.create(makeAgent({ id: "agt_p", portfolioId: "pf_1", kind: "execution" }));

    const found = await h.repos.agents.findById("agt_g");
    expect(found).toEqual(agent);
    expect(found?.schedule.intervalMinutes).toBe(15);

    expect((await h.repos.agents.list({ portfolioId: "pf_1" }, PAGE)).total).toBe(1);
    expect((await h.repos.agents.list({ portfolioId: "pf_1", includeGlobal: true }, PAGE)).total).toBe(2);
  });

  it("round-trips run input/output and keeps steps ordered by index", async () => {
    const run = makeAgentRun({
      id: "run_1",
      agentId: "agt_1",
      input: { instrumentIds: ["ins_1", "ins_2"], riskBudget: 250_000 },
      output: { signals: 2, note: "regime is risk-on" },
      signalIds: ["sig_1"],
      orderIds: ["ord_1", "ord_2"],
    });
    await h.repos.agentRuns.create(run);

    const found = await h.repos.agentRuns.findById("run_1");
    expect(found?.input).toEqual({ instrumentIds: ["ins_1", "ins_2"], riskBudget: 250_000 });
    expect(found?.output).toEqual({ signals: 2, note: "regime is risk-on" });
    expect(found?.orderIds).toEqual(["ord_1", "ord_2"]);

    for (const i of [2, 0, 1]) {
      await h.repos.agentRuns.appendStep(
        makeAgentStep({ id: `step_${i}`, runId: "run_1", index: i, kind: i === 1 ? "tool_call" : "thought", toolName: i === 1 ? "get_quotes" : null, toolInput: i === 1 ? { symbols: ["SPY"] } : null }),
      );
    }
    const steps = await h.repos.agentRuns.listSteps("run_1");
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(steps[1].toolInput).toEqual({ symbols: ["SPY"] });
  });
});

describe("SignalRepository", () => {
  it("round-trips the factors array", async () => {
    const signal = makeSignal({
      id: "sig_1",
      portfolioId: "pf_1",
      agentId: "agt_1",
      factors: [
        { factor: "term structure", weight: 0.4, evidence: "VIX futures in contango" },
        { factor: "positioning", weight: 0.35, evidence: "CTA exposure at 12-month low" },
      ],
    });
    await h.repos.signals.create(signal);
    const found = await h.repos.signals.findById("sig_1");
    expect(found).toEqual(signal);
    expect(found?.factors[1].weight).toBe(0.35);
  });

  it("filters by status and agent", async () => {
    await h.repos.signals.create(makeSignal({ id: "s1", status: "new", agentId: "a1", portfolioId: "pf_1" }));
    await h.repos.signals.create(makeSignal({ id: "s2", status: "acted", agentId: "a1", portfolioId: "pf_1" }));
    expect((await h.repos.signals.list({ status: "new" }, PAGE)).total).toBe(1);
    expect((await h.repos.signals.list({ agentId: "a1" }, PAGE)).total).toBe(2);
  });
});

describe("RiskLimitRepository.listApplicable", () => {
  it("returns limits for every applicable scope and skips disabled or unrelated ones", async () => {
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_platform", scope: "platform", scopeId: null, enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_desk", scope: "desk", scopeId: "desk_1", enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_pf", scope: "portfolio", scopeId: "pf_1", enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_strat", scope: "strategy", scopeId: "strat_1", enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_agent", scope: "agent", scopeId: "agt_1", enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_elsewhere", scope: "desk", scopeId: "desk_9", enabled: true }));
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_off", scope: "platform", scopeId: null, enabled: false }));

    const ids = (await h.repos.riskLimits.listApplicable({ portfolioId: "pf_1", deskId: "desk_1", strategyId: "strat_1", agentId: "agt_1" })).map((l) => l.id).sort();
    expect(ids).toEqual(["l_agent", "l_desk", "l_pf", "l_platform", "l_strat"]);
  });

  it("deletes a limit", async () => {
    await h.repos.riskLimits.create(makeRiskLimit({ id: "l_del", scope: "platform", scopeId: null }));
    await h.repos.riskLimits.delete("l_del");
    expect(await h.repos.riskLimits.findById("l_del")).toBeNull();
  });
});

describe("RiskBreachRepository and approvals", () => {
  it("round-trips the detectedBy actor and filters by status", async () => {
    await h.repos.riskBreaches.create(makeRiskBreach({ id: "b_open", portfolioId: "pf_1", status: "open", severity: "critical", detectedBy: { kind: "system", id: "system", name: "system" } }));
    await h.repos.riskBreaches.create(makeRiskBreach({ id: "b_res", portfolioId: "pf_1", status: "resolved", severity: "warning" }));

    expect((await h.repos.riskBreaches.list({ portfolioId: "pf_1", status: "open" }, PAGE)).total).toBe(1);
    expect((await h.repos.riskBreaches.findById("b_open"))?.detectedBy.kind).toBe("system");
  });

  it("finds the pending approval for a subject", async () => {
    await h.repos.approvals.create(makeApproval({ id: "apr_1", subjectId: "ord_1", status: "approved" }));
    await h.repos.approvals.create(makeApproval({ id: "apr_2", subjectId: "ord_1", status: "pending" }));
    expect((await h.repos.approvals.findPendingBySubject("ord_1"))?.id).toBe("apr_2");
    expect(await h.repos.approvals.findPendingBySubject("ord_none")).toBeNull();
  });
});

describe("AuditRepository", () => {
  it("round-trips the data payload, filters and orders newest first", async () => {
    await h.repos.audit.createMany([
      makeAuditEvent({ id: "a1", action: "auth.login", at: "2026-09-01T00:00:00.000Z", data: { ip: "10.0.0.1" } }),
      makeAuditEvent({ id: "a2", action: "order.filled", at: "2026-09-03T00:00:00.000Z", portfolioId: "pf_1", data: { qty: 100, price: 12.5 } }),
      makeAuditEvent({ id: "a3", action: "order.created", at: "2026-09-02T00:00:00.000Z", portfolioId: "pf_1" }),
    ]);

    const all = await h.repos.audit.list({}, PAGE);
    expect(all.items.map((e) => e.id)).toEqual(["a2", "a3", "a1"]);
    expect(all.items[0].data).toEqual({ qty: 100, price: 12.5 });
    expect((await h.repos.audit.list({ action: "auth.login" }, PAGE)).total).toBe(1);
    expect((await h.repos.audit.list({ portfolioIds: ["pf_1"] }, PAGE)).total).toBe(2);
  });
});

describe("BarRepository", () => {
  it("stores bars per interval, returns ascending, and is idempotent", async () => {
    const bars = Array.from({ length: 8 }, (_, i) =>
      makeBar({ instrumentId: "ins_b", time: new Date(Date.parse("2026-09-01T00:00:00.000Z") + i * 86_400_000).toISOString(), close: 100 + i }),
    );
    await h.repos.bars.createMany("1d", bars);
    await h.repos.bars.createMany("1d", bars); // re-insert must not duplicate
    await h.repos.bars.createMany("1h", [bars[0]]);

    const daily = await h.repos.bars.list("ins_b", "1d", {});
    expect(daily).toHaveLength(8);
    for (let i = 1; i < daily.length; i++) expect(Date.parse(daily[i].time)).toBeGreaterThan(Date.parse(daily[i - 1].time));
    expect(await h.repos.bars.list("ins_b", "1h", {})).toHaveLength(1);

    const recent = await h.repos.bars.list("ins_b", "1d", { limit: 3 });
    expect(recent).toHaveLength(3);
    expect(recent[2].close).toBe(107);
  });
});

describe("BrokerAccountRepository", () => {
  it("finds by portfolio + broker and links to the portfolio and broker", async () => {
    await h.repos.desks.create(makeDesk({ id: "desk_1", code: "D1" }));
    await h.repos.portfolios.create(makePortfolio({ id: "pf_1", deskId: "desk_1", code: "P1" }));
    await h.repos.brokerAccounts.create(makeBrokerAccount({ id: "acct_1", portfolioId: "pf_1", broker: "ibkr" }));
    await h.repos.brokerAccounts.create(makeBrokerAccount({ id: "acct_2", portfolioId: "pf_1", broker: "oanda" }));

    expect((await h.repos.brokerAccounts.findByPortfolioAndBroker("pf_1", "oanda"))?.id).toBe("acct_2");
    expect(await h.repos.brokerAccounts.findByPortfolioAndBroker("pf_1", "kalshi")).toBeNull();
    expect(await edgeTargets(h.client, "BrokerAccount", "acct_1", "FUNDS")).toEqual(["pf_1"]);
    expect(await edgeTargets(h.client, "BrokerAccount", "acct_1", "AT")).toEqual(["ibkr"]);
  });
});

describe("clearAll", () => {
  it("removes entity nodes", async () => {
    await h.repos.desks.create(makeDesk({ id: "desk_x", code: "X" }));
    await h.repos.orders.create(makeOrder({ id: "ord_x", portfolioId: "pf_x" }));
    await clearDatabase(h.client);
    const row = await h.client.readOne<{ c: number }>("MATCH (n:Desk) RETURN count(n) AS c");
    expect(Number(row?.c)).toBe(0);
  });
});
