import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, expectPaged, type ApiWorld } from "./helpers";
import { GET as listInstruments } from "@/app/api/instruments/route";
import { GET as getInstrument } from "@/app/api/instruments/[id]/route";
import { GET as getQuote } from "@/app/api/instruments/[id]/quote/route";
import { GET as getBars } from "@/app/api/instruments/[id]/bars/route";
import { GET as getQuotes } from "@/app/api/market/quotes/route";
import { GET as overview } from "@/app/api/market/overview/route";
import { GET as listUsers } from "@/app/api/users/route";
import { GET as listRoles } from "@/app/api/roles/route";
import { GET as listDesks } from "@/app/api/desks/route";
import { GET as getDesk } from "@/app/api/desks/[id]/route";
import { GET as listPortfolios } from "@/app/api/portfolios/route";
import { GET as getPortfolio } from "@/app/api/portfolios/[id]/route";
import { GET as snapshot } from "@/app/api/portfolios/[id]/snapshot/route";
import { GET as firmSnapshot } from "@/app/api/firm/snapshot/route";
import { GET as listBrokers } from "@/app/api/brokers/route";
import { GET as listAccounts } from "@/app/api/brokers/accounts/route";
import { GET as listPositions } from "@/app/api/positions/route";
import { GET as listStrategies } from "@/app/api/strategies/route";
import { GET as listAgents } from "@/app/api/agents/route";
import { GET as listSignals } from "@/app/api/signals/route";
import { GET as listApprovals } from "@/app/api/approvals/route";
import { GET as pendingCount } from "@/app/api/approvals/pending-count/route";

let w: ApiWorld;
let pm: string;
let admin: string;
beforeAll(async () => {
  w = await setupApiWorld();
  pm = await loginAs(w.users.pm.email);
  admin = await loginAs(w.users.admin.email);
});

describe("paging envelope", () => {
  it("GET /api/instruments honours limit/offset and returns { items, total, limit, offset }", async () => {
    const first = await call(listInstruments, "GET", "/api/instruments?limit=2", { cookie: pm });
    expect(first.status).toBe(200);
    expectPaged(first.data);
    expect(first.data.items).toHaveLength(2);
    expect(first.data.limit).toBe(2);
    expect(first.data.offset).toBe(0);
    expect(first.data.total).toBe(4);

    const second = await call(listInstruments, "GET", "/api/instruments?limit=2&offset=2", { cookie: pm });
    expectPaged(second.data);
    expect(second.data.offset).toBe(2);
    expect(second.data.items).toHaveLength(2);
    const ids = (x: { items: unknown[] }) => x.items.map((i) => (i as { id: string }).id);
    expect(new Set([...ids(first.data), ...ids(second.data)]).size).toBe(4);
  });

  it("defaults limit to 50 and rejects out-of-range paging", async () => {
    const r = await call(listInstruments, "GET", "/api/instruments", { cookie: pm });
    expectPaged(r.data);
    expect(r.data.limit).toBe(50);
    const bad = await call(listInstruments, "GET", "/api/instruments?limit=0", { cookie: pm });
    expect(bad.status).toBe(400);
  });

  it("filters instruments by assetClass / broker / search", async () => {
    const fx = await call(listInstruments, "GET", "/api/instruments?assetClass=forex", { cookie: pm });
    expectPaged(fx.data);
    expect(fx.data.items.map((i) => (i as { symbol: string }).symbol)).toEqual(["EUR/USD"]);
    const cb = await call(listInstruments, "GET", "/api/instruments?broker=coinbase", { cookie: pm });
    expectPaged(cb.data);
    expect(cb.data.total).toBe(1);
    const search = await call(listInstruments, "GET", "/api/instruments?search=AAPL", { cookie: pm });
    expectPaged(search.data);
    expect(search.data.items.map((i) => (i as { symbol: string }).symbol)).toContain("AAPL");
  });
});

describe("instruments & market data", () => {
  it("GET /api/instruments/[id] and 404 for unknown", async () => {
    const ok = await call<{ id: string; symbol: string }>(getInstrument, "GET", `/api/instruments/${w.instruments.aapl.id}`, {
      cookie: pm,
      params: { id: w.instruments.aapl.id },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.symbol).toBe("AAPL");
    const missing = await call(getInstrument, "GET", "/api/instruments/ins_nope", { cookie: pm, params: { id: "ins_nope" } });
    expect(missing.status).toBe(404);
    expect(missing.error?.code).toBe("NOT_FOUND");
  });

  it("GET /api/instruments/[id]/quote returns a quote", async () => {
    const r = await call<{ instrumentId: string; bid: number; ask: number; last: number }>(getQuote, "GET", `/api/instruments/${w.instruments.aapl.id}/quote`, {
      cookie: pm,
      params: { id: w.instruments.aapl.id },
    });
    expect(r.status).toBe(200);
    expect(r.data.instrumentId).toBe(w.instruments.aapl.id);
    expect(r.data.ask).toBeGreaterThanOrEqual(r.data.bid);
    expect(r.data.last).toBeGreaterThan(0);
  });

  it("GET /api/instruments/[id]/bars validates interval/count", async () => {
    const r = await call<Array<{ time: string; close: number }>>(getBars, "GET", `/api/instruments/${w.instruments.aapl.id}/bars?interval=1d&count=5`, {
      cookie: pm,
      params: { id: w.instruments.aapl.id },
    });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeLessThanOrEqual(5);
    const bad = await call(getBars, "GET", `/api/instruments/${w.instruments.aapl.id}/bars?interval=2w`, { cookie: pm, params: { id: w.instruments.aapl.id } });
    expect(bad.status).toBe(400);
  });

  it("GET /api/market/quotes?ids=a,b returns one quote per id; requires ids", async () => {
    const ids = [w.instruments.aapl.id, w.instruments.btc.id];
    const r = await call<Array<{ instrumentId: string }>>(getQuotes, "GET", `/api/market/quotes?ids=${ids.join(",")}`, { cookie: pm });
    expect(r.status).toBe(200);
    expect(r.data.map((q) => q.instrumentId).sort()).toEqual([...ids].sort());
    expect((await call(getQuotes, "GET", "/api/market/quotes", { cookie: pm })).status).toBe(400);
  });

  it("GET /api/market/overview", async () => {
    const r = await call<{ asOf: string; regime: string; indicators: unknown[]; movers: unknown[] }>(overview, "GET", "/api/market/overview", { cookie: pm });
    expect(r.status).toBe(200);
    expect(["risk_on", "risk_off", "neutral", "volatile"]).toContain(r.data.regime);
    expect(Array.isArray(r.data.indicators)).toBe(true);
  });
});

describe("org & users", () => {
  it("GET /api/users filters by role and desk", async () => {
    const r = await call(listUsers, "GET", "/api/users?role=trader", { cookie: admin });
    expect(r.status).toBe(200);
    expectPaged(r.data);
    expect(r.data.items.map((u) => (u as { email: string }).email)).toEqual([w.users.trader.email]);
    const byDesk = await call(listUsers, "GET", `/api/users?deskId=${w.desk.id}`, { cookie: admin });
    expectPaged(byDesk.data);
    expect(byDesk.data.total).toBeGreaterThanOrEqual(4);
  });

  it("GET /api/roles returns the catalogue with permissions", async () => {
    const r = await call<Array<{ key: string; permissions: string[] }>>(listRoles, "GET", "/api/roles", { cookie: pm });
    expect(r.status).toBe(200);
    expect(r.data.map((x) => x.key)).toContain("risk_manager");
    expect(r.data.find((x) => x.key === "global_admin")?.permissions).toContain("platform:admin");
  });

  it("GET /api/desks and /api/desks/[id]", async () => {
    const list = await call(listDesks, "GET", "/api/desks", { cookie: admin });
    expectPaged(list.data);
    expect(list.data.total).toBe(2);
    const one = await call<{ id: string; code: string }>(getDesk, "GET", `/api/desks/${w.desk.id}`, { cookie: admin, params: { id: w.desk.id } });
    expect(one.status).toBe(200);
    expect(one.data.code).toBe("MACRO");
  });
});

describe("portfolios, brokers, positions, strategies, agents", () => {
  it("GET /api/portfolios (+ deskId/status filters) and /api/portfolios/[id]", async () => {
    const list = await call(listPortfolios, "GET", `/api/portfolios?deskId=${w.desk.id}&status=active`, { cookie: pm });
    expect(list.status).toBe(200);
    expectPaged(list.data);
    expect(list.data.items.map((p) => (p as { id: string }).id)).toEqual([w.portfolio.id]);
    const one = await call<{ id: string; nav: number }>(getPortfolio, "GET", `/api/portfolios/${w.portfolio.id}`, { cookie: pm, params: { id: w.portfolio.id } });
    expect(one.status).toBe(200);
    expect(one.data.nav).toBe(w.portfolio.nav);
  });

  it("GET /api/portfolios/[id]/snapshot and /api/firm/snapshot", async () => {
    const s = await call<{ portfolioId: string; nav: number; positionCount: number }>(snapshot, "GET", `/api/portfolios/${w.portfolio.id}/snapshot`, {
      cookie: pm,
      params: { id: w.portfolio.id },
    });
    expect(s.status).toBe(200);
    expect(s.data.portfolioId).toBe(w.portfolio.id);
    const f = await call<{ portfolioCount: number; totalNav: number; portfolios: unknown[] }>(firmSnapshot, "GET", "/api/firm/snapshot", { cookie: admin });
    expect(f.status).toBe(200);
    expect(f.data.portfolioCount).toBe(1);
  });

  it("GET /api/brokers and /api/brokers/accounts", async () => {
    const b = await call<Array<{ capabilities: { broker: string }; health: { status: string }; accountCount: number }>>(listBrokers, "GET", "/api/brokers", { cookie: pm });
    expect(b.status).toBe(200);
    expect(b.data.map((x) => x.capabilities.broker).sort()).toEqual(["coinbase", "ibkr", "kalshi", "oanda", "tradovate"]);
    const a = await call(listAccounts, "GET", `/api/brokers/accounts?portfolioId=${w.portfolio.id}&broker=oanda`, { cookie: pm });
    expectPaged(a.data);
    expect(a.data.items.map((x) => (x as { id: string }).id)).toEqual([w.accounts.oanda.id]);
  });

  it("GET /api/positions?open=true", async () => {
    const r = await call(listPositions, "GET", `/api/positions?portfolioId=${w.portfolio.id}&open=true`, { cookie: pm });
    expect(r.status).toBe(200);
    expectPaged(r.data);
  });

  it("GET /api/strategies, /api/agents, /api/signals, /api/approvals", async () => {
    const s = await call(listStrategies, "GET", `/api/strategies?deskId=${w.desk.id}`, { cookie: pm });
    expectPaged(s.data);
    expect(s.data.items.map((x) => (x as { id: string }).id)).toEqual([w.strategy.id]);
    const a = await call(listAgents, "GET", `/api/agents?kind=market_intelligence`, { cookie: pm });
    expectPaged(a.data);
    expect(a.data.items.map((x) => (x as { id: string }).id)).toContain(w.agent.id);
    const sig = await call(listSignals, "GET", `/api/signals?portfolioId=${w.portfolio.id}`, { cookie: pm });
    expectPaged(sig.data);
    const ap = await call(listApprovals, "GET", `/api/approvals?status=pending`, { cookie: pm });
    expectPaged(ap.data);
    const pc = await call<{ count: number }>(pendingCount, "GET", "/api/approvals/pending-count", { cookie: pm });
    expect(pc.status).toBe(200);
    expect(pc.data.count).toBe(ap.data.total);
  });
});
