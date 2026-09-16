import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, expectPaged, type ApiWorld } from "./helpers";
import type { Order, Fill } from "@/lib/domain/order";
import { GET as listOrders, POST as createOrder } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { GET as getFills } from "@/app/api/orders/[id]/fills/route";
import { POST as cancelOrder } from "@/app/api/orders/[id]/cancel/route";
import { GET as getPosition } from "@/app/api/positions/[id]/route";
import { GET as listPositions } from "@/app/api/positions/route";
import { POST as closePosition } from "@/app/api/positions/[id]/close/route";
import { POST as mark } from "@/app/api/portfolios/[id]/mark/route";

const SUBMIT_STATUSES = ["FILLED", "PARTIALLY_FILLED", "ACKNOWLEDGED", "ROUTED", "PENDING_APPROVAL", "RISK_REJECTED"];

let w: ApiWorld;
let pm: string;
let trader: string;
beforeAll(async () => {
  w = await setupApiWorld();
  pm = await loginAs(w.users.pm.email);
  trader = await loginAs(w.users.trader.email);
});

describe("POST /api/orders", () => {
  it("submits a market order through the full pipeline", async () => {
    const r = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", quantity: 10, rationale: "api test" },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.id).toMatch(/^ord_/);
    expect(r.data.portfolioId).toBe(w.portfolio.id);
    expect(r.data.instrumentId).toBe(w.instruments.aapl.id);
    expect(r.data.symbol).toBe("AAPL");
    expect(r.data.type).toBe("MARKET");
    expect(r.data.timeInForce).toBe("DAY");
    expect(r.data.origin).toBe("manual");
    expect(r.data.createdBy).toMatchObject({ kind: "user", id: w.users.pm.id });
    expect(SUBMIT_STATUSES).toContain(r.data.status);
    expect(Array.isArray(r.data.riskChecks)).toBe(true);
    expect(r.data.estimatedNotional).toBeGreaterThan(0);
  });

  it("fetches the order by id and its fills", async () => {
    const created = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: trader,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.msft.id, side: "BUY", quantity: 5 },
    });
    expect(created.status).toBe(200);
    const fetched = await call<Order>(getOrder, "GET", `/api/orders/${created.data.id}`, { cookie: trader, params: { id: created.data.id } });
    expect(fetched.status).toBe(200);
    expect(fetched.data.id).toBe(created.data.id);

    const fills = await call<Fill[]>(getFills, "GET", `/api/orders/${created.data.id}/fills`, { cookie: trader, params: { id: created.data.id } });
    expect(fills.status).toBe(200);
    expect(Array.isArray(fills.data)).toBe(true);
    for (const f of fills.data) expect(f.orderId).toBe(created.data.id);
    if (fetched.data.status === "FILLED") {
      expect(fills.data.reduce((s, f) => s + f.quantity, 0)).toBeCloseTo(fetched.data.filledQuantity);
    }
  });

  it("supports limit orders with limitPrice", async () => {
    const r = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", type: "LIMIT", quantity: 1, limitPrice: 1, timeInForce: "GTC" },
    });
    expect(r.status).toBe(200);
    expect(r.data.type).toBe("LIMIT");
    expect(r.data.limitPrice).toBe(1);
  });

  it("returns 404 for an unknown portfolio or instrument", async () => {
    const r = await call(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: "pf_nope", instrumentId: w.instruments.aapl.id, side: "BUY", quantity: 1 },
    });
    expect([404, 403]).toContain(r.status);
  });
});

describe("GET /api/orders", () => {
  it("lists with the paging envelope and honours filters", async () => {
    const all = await call(listOrders, "GET", `/api/orders?portfolioId=${w.portfolio.id}`, { cookie: pm });
    expect(all.status).toBe(200);
    expectPaged(all.data);
    expect(all.data.total).toBeGreaterThanOrEqual(3);

    const byInstrument = await call(listOrders, "GET", `/api/orders?instrumentId=${w.instruments.msft.id}`, { cookie: pm });
    expectPaged(byInstrument.data);
    for (const o of byInstrument.data.items) expect((o as Order).instrumentId).toBe(w.instruments.msft.id);

    const byStatuses = await call(listOrders, "GET", `/api/orders?statuses=FILLED,ACKNOWLEDGED,PENDING_APPROVAL`, { cookie: pm });
    expect(byStatuses.status).toBe(200);
    expectPaged(byStatuses.data);
    for (const o of byStatuses.data.items) expect(["FILLED", "ACKNOWLEDGED", "PENDING_APPROVAL"]).toContain((o as Order).status);
  });
});

describe("GET /api/orders/[id]", () => {
  it("returns 404 for an unknown id", async () => {
    const r = await call(getOrder, "GET", "/api/orders/ord_nope", { cookie: pm, params: { id: "ord_nope" } });
    expect(r.status).toBe(404);
    expect(r.error?.code).toBe("NOT_FOUND");
    expect(r.error?.details).toMatchObject({ id: "ord_nope" });
  });
});

describe("POST /api/orders/[id]/cancel", () => {
  it("requires a reason", async () => {
    const r = await call(cancelOrder, "POST", "/api/orders/ord_x/cancel", { cookie: pm, params: { id: "ord_x" }, body: {} });
    expect(r.status).toBe(400);
  });

  it("cancels a resting limit order or reports invalid state for terminal ones", async () => {
    const created = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", type: "LIMIT", quantity: 1, limitPrice: 1, timeInForce: "GTC" },
    });
    const r = await call<Order>(cancelOrder, "POST", `/api/orders/${created.data.id}/cancel`, {
      cookie: pm,
      params: { id: created.data.id },
      body: { reason: "changed my mind" },
    });
    if (r.status === 200) expect(r.data.status).toBe("CANCELLED");
    else expect([409, 422]).toContain(r.status);
  });
});

describe("positions", () => {
  it("a filled buy shows up as an open position which can be closed", async () => {
    const created = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.btc.id, side: "BUY", quantity: 0.5, rationale: "position test" },
    });
    expect(created.status).toBe(200);
    if (created.data.status !== "FILLED" && created.data.status !== "PARTIALLY_FILLED") return; // mock broker didn't fill synchronously

    const positions = await call(listPositions, "GET", `/api/positions?portfolioId=${w.portfolio.id}&open=true&assetClass=crypto`, { cookie: pm });
    expectPaged(positions.data);
    const pos = positions.data.items.find((p) => (p as { instrumentId: string }).instrumentId === w.instruments.btc.id) as { id: string; quantity: number } | undefined;
    expect(pos).toBeTruthy();
    expect(pos!.quantity).toBeGreaterThan(0);

    const one = await call<{ id: string }>(getPosition, "GET", `/api/positions/${pos!.id}`, { cookie: pm, params: { id: pos!.id } });
    expect(one.status).toBe(200);

    const marked = await call<{ portfolioId: string }>(mark, "POST", `/api/portfolios/${w.portfolio.id}/mark`, { cookie: pm, params: { id: w.portfolio.id } });
    expect(marked.status).toBe(200);

    const closed = await call<Order>(closePosition, "POST", `/api/positions/${pos!.id}/close`, {
      cookie: pm,
      params: { id: pos!.id },
      body: { rationale: "take profit" },
    });
    expect(closed.status).toBe(200);
    expect(closed.data.side).toBe("SELL");
    expect(SUBMIT_STATUSES).toContain(closed.data.status);
  });

  it("analyst cannot close positions", async () => {
    const analyst = await loginAs(w.users.analyst.email);
    const r = await call(closePosition, "POST", "/api/positions/pos_x/close", { cookie: analyst, params: { id: "pos_x" }, body: { rationale: "x" } });
    expect(r.status).toBe(403);
  });
});
