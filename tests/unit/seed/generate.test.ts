import { describe, it, expect } from "vitest";
import { generateSeedData, validateSeedData, seedCounts, SeedValidationError, type SeedData } from "@/lib/seed/generate";
import { ROLE_CATALOG } from "@/lib/auth/permissions";
import { FX_TO_USD } from "@/lib/seed/data/instruments";
import type { Bar } from "@/lib/domain/instrument";

const data = generateSeedData();

/** Index every entity id so foreign keys can be resolved cheaply. */
function index<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

describe("generateSeedData", () => {
  it("is deterministic: two generations are deeply equal", () => {
    expect(generateSeedData()).toEqual(generateSeedData());
  });

  it("respects an explicit seed and clock", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const a = generateSeedData({ now, seed: 42 });
    const b = generateSeedData({ now, seed: 42 });
    expect(a).toEqual(b);
    expect(a.orders).not.toEqual(data.orders);
  });

  it("produces entity counts in the expected ranges", () => {
    const counts = seedCounts(data);
    expect(counts.roles).toBe(ROLE_CATALOG.length);
    expect(counts.users).toBeGreaterThanOrEqual(12);
    expect(counts.desks).toBeGreaterThanOrEqual(5);
    expect(counts.instruments).toBeGreaterThanOrEqual(60);
    expect(counts.portfolios).toBeGreaterThanOrEqual(6);
    expect(counts.positions).toBeGreaterThanOrEqual(40);
    expect(counts.strategies).toBeGreaterThanOrEqual(8);
    expect(counts.agents).toBeGreaterThanOrEqual(12);
    expect(counts.agentRuns).toBeGreaterThanOrEqual(30);
    expect(counts.agentSteps).toBeGreaterThanOrEqual(80);
    expect(counts.signals).toBeGreaterThanOrEqual(20);
    expect(counts.orders).toBeGreaterThanOrEqual(100);
    expect(counts.fills).toBeGreaterThanOrEqual(70);
    expect(counts.riskLimits).toBeGreaterThanOrEqual(15);
    expect(counts.riskBreaches).toBeGreaterThanOrEqual(6);
    expect(counts.approvals).toBeGreaterThanOrEqual(8);
    expect(counts.auditEvents).toBeGreaterThanOrEqual(100);
    expect(counts.dailyBars).toBeGreaterThan(1_000);
    expect(counts.hourlyBars).toBeGreaterThan(500);
  });

  it("assigns every entity a unique id", () => {
    const all: string[] = [
      ...data.users, ...data.desks, ...data.instruments, ...data.portfolios, ...data.brokerAccounts,
      ...data.positions, ...data.strategies, ...data.backtests, ...data.agents, ...data.agentRuns,
      ...data.agentSteps, ...data.signals, ...data.orders, ...data.fills, ...data.riskLimits,
      ...data.riskBreaches, ...data.approvals, ...data.auditEvents,
    ].map((e) => e.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("validateSeedData", () => {
  it("accepts the generated dataset", () => {
    expect(() => validateSeedData(data)).not.toThrow();
  });

  it("throws a SeedValidationError naming the entity and field for a dangling reference", () => {
    const broken: SeedData = { ...data, orders: data.orders.map((o, i) => (i === 0 ? { ...o, portfolioId: "pf_missing" } : o)) };
    expect(() => validateSeedData(broken)).toThrow(SeedValidationError);
    expect(() => validateSeedData(broken)).toThrow(/order .* field 'portfolioId'.*pf_missing/);
  });

  it("throws when an entity fails its zod schema", () => {
    const broken: SeedData = { ...data, signals: data.signals.map((s, i) => (i === 0 ? { ...s, conviction: 4 } : s)) };
    expect(() => validateSeedData(broken)).toThrow(/signals\[0\] failed schema validation at field 'conviction'/);
  });
});

describe("organisation", () => {
  it("gives the admin user the global_admin role", () => {
    const admin = data.users.find((u) => u.email === "admin@agenticprop.io");
    expect(admin).toBeDefined();
    expect(admin?.roles).toContain("global_admin");
  });

  it("seeds every role in the catalogue with its permissions", () => {
    for (const catalogued of ROLE_CATALOG) {
      const role = data.roles.find((r) => r.key === catalogued.key);
      expect(role, `role ${catalogued.key} missing`).toBeDefined();
      expect(role?.permissions).toEqual(catalogued.permissions);
    }
  });

  it("points every desk at a real head and every portfolio at a real manager", () => {
    const users = index(data.users);
    for (const desk of data.desks) expect(users.has(desk.headUserId ?? "")).toBe(true);
    for (const p of data.portfolios) expect(users.has(p.managerUserId)).toBe(true);
  });
});

describe("positions", () => {
  it("only holds asset classes the portfolio mandate permits", () => {
    const portfolios = index(data.portfolios);
    for (const position of data.positions) {
      const portfolio = portfolios.get(position.portfolioId);
      expect(portfolio, `portfolio ${position.portfolioId} missing`).toBeDefined();
      expect(portfolio?.mandate.assetClasses).toContain(position.assetClass);
    }
  });

  it("books each position against a broker account belonging to the same portfolio and broker", () => {
    const accounts = index(data.brokerAccounts);
    const instruments = index(data.instruments);
    for (const position of data.positions) {
      const account = accounts.get(position.brokerAccountId);
      expect(account?.portfolioId).toBe(position.portfolioId);
      expect(account?.broker).toBe(instruments.get(position.instrumentId)?.broker);
    }
  });

  it("keeps market value and unrealised PnL consistent with quantity and marks", () => {
    const instruments = index(data.instruments);
    for (const position of data.positions.filter((p) => p.closedAt === null)) {
      const instrument = instruments.get(position.instrumentId);
      expect(instrument).toBeDefined();
      if (!instrument) continue;
      const unit = instrument.multiplier * FX_TO_USD[instrument.currency];
      expect(position.marketValue).toBeCloseTo(position.quantity * position.markPrice * unit, 0);
      expect(position.unrealizedPnl).toBeCloseTo(position.quantity * (position.markPrice - position.averagePrice) * unit, 0);
    }
  });
});

describe("orders and fills", () => {
  it("covers every lifecycle status the domain defines as reachable", () => {
    const seen = new Set(data.orders.map((o) => o.status));
    for (const status of ["FILLED", "PARTIALLY_FILLED", "ACKNOWLEDGED", "CANCELLED", "RISK_REJECTED", "PENDING_APPROVAL", "APPROVAL_REJECTED", "ERROR"]) {
      expect(seen, `status ${status} missing`).toContain(status);
    }
    expect(new Set(data.orders.map((o) => o.origin))).toEqual(new Set(["manual", "agent", "strategy", "risk_unwind"]));
  });

  it("reconciles filledQuantity and averageFillPrice with the fills", () => {
    const byOrder = new Map<string, typeof data.fills>();
    for (const fill of data.fills) {
      const list = byOrder.get(fill.orderId) ?? [];
      list.push(fill);
      byOrder.set(fill.orderId, list);
    }
    for (const order of data.orders) {
      const fills = byOrder.get(order.id) ?? [];
      if (fills.length === 0) {
        expect(order.filledQuantity).toBe(0);
        expect(order.averageFillPrice).toBeNull();
        continue;
      }
      const quantity = fills.reduce((s, f) => s + f.quantity, 0);
      const notional = fills.reduce((s, f) => s + f.quantity * f.price, 0);
      expect(order.filledQuantity).toBeCloseTo(quantity, 4);
      expect(order.averageFillPrice ?? 0).toBeCloseTo(notional / quantity, 4);
      expect(order.filledQuantity).toBeLessThanOrEqual(order.quantity + 1e-6);
      if (order.status === "FILLED") expect(order.filledQuantity).toBeCloseTo(order.quantity, 4);
      for (const fill of fills) {
        expect(fill.side).toBe(order.side);
        expect(fill.portfolioId).toBe(order.portfolioId);
        expect(fill.commission).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("populates a failing risk check on every risk-rejected order", () => {
    const rejected = data.orders.filter((o) => o.status === "RISK_REJECTED");
    expect(rejected.length).toBeGreaterThan(0);
    for (const order of rejected) {
      expect(order.riskChecks.some((c) => !c.passed)).toBe(true);
      expect(order.rejectionReason).toBeTruthy();
    }
  });

  it("attaches an approval to every order waiting on or refused by one", () => {
    const approvals = index(data.approvals);
    for (const order of data.orders.filter((o) => o.status === "PENDING_APPROVAL" || o.status === "APPROVAL_REJECTED")) {
      expect(order.approvalId).toBeTruthy();
      const approval = approvals.get(order.approvalId ?? "");
      expect(approval?.subjectId).toBe(order.id);
    }
  });

  it("gives every agent-originated order a rationale", () => {
    for (const order of data.orders.filter((o) => o.origin === "agent")) {
      expect(order.rationale.length).toBeGreaterThan(40);
      expect(order.createdBy.kind).toBe("agent");
    }
  });
});

describe("agents", () => {
  it("covers every run status and prices runs against the model's rate card", () => {
    const statuses = new Set(data.agentRuns.map((r) => r.status));
    for (const status of ["succeeded", "failed", "killed", "budget_exhausted"]) expect(statuses).toContain(status);
    for (const run of data.agentRuns) {
      expect(run.costUsd).toBeGreaterThan(0);
      expect(run.inputTokens).toBeGreaterThan(0);
      if (run.status === "succeeded") expect(run.output).not.toBeNull();
      else expect(run.error === null || run.error.length > 10).toBe(true);
    }
  });

  it("orders every run's steps by contiguous index", () => {
    const byRun = new Map<string, number[]>();
    for (const step of data.agentSteps) {
      const list = byRun.get(step.runId) ?? [];
      list.push(step.index);
      byRun.set(step.runId, list);
    }
    for (const [runId, indexes] of byRun) {
      const sorted = [...indexes].sort((a, b) => a - b);
      expect(sorted, `run ${runId} has non-contiguous steps`).toEqual(indexes.map((_, i) => i));
    }
    for (const run of data.agentRuns) expect(run.stepCount).toBe(byRun.get(run.id)?.length ?? 0);
  });

  it("gives every signal a thesis and weighted factors", () => {
    for (const signal of data.signals) {
      expect(signal.thesis.length).toBeGreaterThan(120);
      expect(signal.factors.length).toBeGreaterThanOrEqual(2);
      for (const factor of signal.factors) {
        expect(factor.weight).toBeGreaterThan(0);
        expect(factor.evidence.length).toBeGreaterThan(10);
      }
      expect(new Date(signal.expiresAt).getTime()).toBeGreaterThan(new Date(signal.createdAt).getTime());
    }
    expect(new Set(data.signals.map((s) => s.status))).toEqual(new Set(["new", "acted", "expired", "dismissed"]));
  });
});

describe("bars", () => {
  const groups = (bars: Bar[]): Map<string, Bar[]> => {
    const out = new Map<string, Bar[]>();
    for (const bar of bars) {
      const list = out.get(bar.instrumentId) ?? [];
      list.push(bar);
      out.set(bar.instrumentId, list);
    }
    return out;
  };

  it("holds the OHLC invariants on every bar", () => {
    for (const bar of [...data.dailyBars, ...data.hourlyBars]) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      expect(bar.low).toBeGreaterThan(0);
      expect(bar.volume).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits strictly ascending, aligned timestamps per instrument", () => {
    for (const [, bars] of groups(data.dailyBars)) {
      for (let i = 1; i < bars.length; i++) {
        expect(new Date(bars[i].time).getTime()).toBeGreaterThan(new Date(bars[i - 1].time).getTime());
      }
      for (const bar of bars) {
        const t = new Date(bar.time);
        expect([t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()]).toEqual([0, 0, 0]);
      }
    }
    for (const [, bars] of groups(data.hourlyBars)) {
      for (let i = 1; i < bars.length; i++) {
        expect(new Date(bars[i].time).getTime()).toBeGreaterThan(new Date(bars[i - 1].time).getTime());
      }
      for (const bar of bars) {
        const t = new Date(bar.time);
        expect([t.getUTCMinutes(), t.getUTCSeconds()]).toEqual([0, 0]);
      }
    }
  });

  it("ends each series near the instrument's mark", () => {
    const instruments = index(data.instruments);
    for (const [instrumentId, bars] of groups(data.dailyBars)) {
      const last = bars[bars.length - 1];
      const hourlyLast = data.hourlyBars.filter((b) => b.instrumentId === instrumentId).slice(-1)[0];
      expect(instruments.has(instrumentId)).toBe(true);
      expect(hourlyLast).toBeDefined();
      expect(Math.abs(last.close - hourlyLast.close) / last.close).toBeLessThan(0.02);
    }
  });
});

describe("risk and audit", () => {
  it("links every breach to a real limit and copies its threshold", () => {
    const limits = index(data.riskLimits);
    for (const breach of data.riskBreaches) {
      const limit = limits.get(breach.limitId);
      expect(limit).toBeDefined();
      expect(breach.threshold).toBe(limit?.threshold);
      expect(breach.limitName).toBe(limit?.name);
      expect(breach.message.length).toBeGreaterThan(30);
      expect(breach.actionTaken.length).toBeGreaterThan(20);
    }
    expect(new Set(data.riskBreaches.map((b) => b.status))).toEqual(new Set(["open", "acknowledged", "resolved"]));
  });

  it("covers the limit scopes and actions the risk engine understands", () => {
    const scopes = new Set(data.riskLimits.map((l) => l.scope));
    for (const scope of ["platform", "desk", "portfolio", "agent"]) expect(scopes).toContain(scope);
    const actions = new Set(data.riskLimits.map((l) => l.action));
    for (const action of ["warn", "block", "require_approval"]) expect(actions).toContain(action);
  });

  it("covers the approval types and decisions the queue must render", () => {
    const types = new Set(data.approvals.map((a) => a.type));
    for (const type of ["order", "strategy_deploy", "agent_autonomy_change"]) expect(types).toContain(type);
    const statuses = new Set(data.approvals.map((a) => a.status));
    for (const status of ["pending", "approved", "rejected", "expired"]) expect(statuses).toContain(status);
    for (const approval of data.approvals) expect(approval.riskSummary.length).toBeGreaterThan(20);
  });

  it("writes audit events in chronological order over the last seven days", () => {
    const times = data.auditEvents.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    expect(newest - oldest).toBeLessThanOrEqual(7 * 24 * 3_600_000);
    const actions = new Set(data.auditEvents.map((e) => e.action));
    for (const action of ["auth.login", "order.created", "agent.run_started", "agent.run_finished", "risk.breach_detected", "approval.requested", "signal.created"]) {
      expect(actions, `audit action ${action} missing`).toContain(action);
    }
  });
});
