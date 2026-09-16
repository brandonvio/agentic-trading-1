import { describe, it, expect, beforeEach } from "vitest";
import { createHarness, type Harness } from "./harness";
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { CreateOrderInput } from "@/lib/domain/order";

let h: Harness;

beforeEach(async () => {
  h = await createHarness({ broker: { price: 200, commission: 5 } });
});

const buy = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  portfolioId: h.portfolio.id,
  instrumentId: h.instruments.aapl.id,
  side: "BUY",
  type: "MARKET",
  quantity: 1000,
  timeInForce: "DAY",
  rationale: "test",
  origin: "manual",
  ...over,
});

describe("OrderService.submit — happy path", () => {
  it("routes, fills, opens a position and moves cash", async () => {
    const cashBefore = h.portfolio.cash;
    const order = await h.services.orders.submit(h.principal("trader"), buy());

    expect(order.status).toBe("FILLED");
    expect(order.filledQuantity).toBe(1000);
    expect(order.averageFillPrice).toBe(200);
    expect(order.externalOrderId).toMatch(/^fake-ibkr-/);
    expect(order.estimatedNotional).toBe(200_000);

    const fills = await h.repos.fills.listByOrder(order.id);
    expect(fills).toHaveLength(1);

    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    expect(position?.quantity).toBe(1000);
    expect(position?.averagePrice).toBe(200);
    expect(position?.marketValue).toBe(200_000);

    const portfolio = await h.repos.portfolios.findById(h.portfolio.id);
    // 1000 * 200 * multiplier(1) debited, plus 5 commission.
    expect(portfolio?.cash).toBeCloseTo(cashBefore - 200_000 - 5, 6);
  });

  it("writes the full audit trail", async () => {
    const order = await h.services.orders.submit(h.principal("trader"), buy());
    const events = await h.repos.audit.list({ targetId: order.id }, { limit: 50, offset: 0 });
    const actions = events.items.map((e) => e.action);
    expect(actions).toContain("order.risk_checked");
    expect(actions).toContain("order.routed");
    expect(actions).toContain("order.filled");
  });

  it("averages up when buying into an existing long", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    h.brokers.configure((a) => (a.price = 300));
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));

    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    expect(position?.quantity).toBe(200);
    expect(position?.averagePrice).toBe(250);
  });

  it("books realised PnL and closes the position when sold out", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    h.brokers.configure((a) => (a.price = 250));
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100, side: "SELL" }));

    const open = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    expect(open).toBeNull();

    const all = await h.repos.positions.list({ portfolioId: h.portfolio.id }, { limit: 10, offset: 0 });
    const closed = all.items.find((p) => p.instrumentId === h.instruments.aapl.id);
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.quantity).toBe(0);
    // Bought 100 @ 200, sold 100 @ 250 → +5,000.
    expect(closed?.realizedPnl).toBeCloseTo(5000, 6);
  });

  it("flips through zero and re-bases the average price", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    h.brokers.configure((a) => (a.price = 250));
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 150, side: "SELL" }));

    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    expect(position?.quantity).toBe(-50);
    expect(position?.averagePrice).toBe(250);
    expect(position?.realizedPnl).toBeCloseTo(5000, 6);
  });

  it("records a partial fill without completing the order", async () => {
    h.brokers.configure((a) => (a.fillRatio = 0.6));
    const order = await h.services.orders.submit(h.principal("trader"), buy({ quantity: 1000 }));
    expect(order.status).toBe("PARTIALLY_FILLED");
    expect(order.filledQuantity).toBe(600);
    expect(order.completedAt).toBeNull();
  });

  it("leaves a resting limit order acknowledged with no fills", async () => {
    h.brokers.configure((a) => (a.restLimits = true));
    const order = await h.services.orders.submit(h.principal("trader"), buy({ type: "LIMIT", limitPrice: 150 }));
    expect(order.status).toBe("ACKNOWLEDGED");
    expect(order.filledQuantity).toBe(0);
    expect(await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id)).toBeNull();
  });

  it("marks a broker rejection as ERROR", async () => {
    h.brokers.configure((a) => (a.reject = { reason: "not enough margin", code: "INSUFFICIENT_MARGIN" }));
    const order = await h.services.orders.submit(h.principal("trader"), buy());
    expect(order.status).toBe("ERROR");
    expect(order.rejectionReason).toContain("INSUFFICIENT_MARGIN");
  });

  it("routes forex to Oanda and crypto to Coinbase", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ instrumentId: h.instruments.eurusd.id, quantity: 100_000 }));
    await h.services.orders.submit(h.principal("trader"), buy({ instrumentId: h.instruments.btc.id, quantity: 10 }));
    expect(h.brokers.get("oanda").placed).toHaveLength(1);
    expect(h.brokers.get("coinbase").placed).toHaveLength(1);
    expect(h.brokers.get("ibkr").placed).toHaveLength(0);
  });
});

describe("OrderService.submit — validation and authorization", () => {
  it("requires orders:create", async () => {
    await expect(h.services.orders.submit(h.principal("analyst"), buy())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.services.orders.submit(h.principal("quant"), buy())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides portfolios on other desks", async () => {
    await expect(h.services.orders.submit(h.principal("otherTrader"), buy())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects unknown instruments and portfolios", async () => {
    await expect(h.services.orders.submit(h.principal("trader"), buy({ instrumentId: "ins_missing" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(h.services.orders.submit(h.principal("trader"), buy({ portfolioId: "pf_missing" }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires a price for limit and stop orders", async () => {
    await expect(h.services.orders.submit(h.principal("trader"), buy({ type: "LIMIT" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(h.services.orders.submit(h.principal("trader"), buy({ type: "STOP" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects non-positive quantities", async () => {
    await expect(h.services.orders.submit(h.principal("trader"), buy({ quantity: 0 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(h.services.orders.submit(h.principal("trader"), buy({ quantity: -5 }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when the portfolio has no account at the instrument's broker", async () => {
    const pf = await h.repos.portfolios.create({ ...h.portfolio, id: "pf_noacct", code: "NO-ACCT" });
    await expect(h.services.orders.submit(h.principal("trader"), buy({ portfolioId: pf.id }))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("OrderService — risk outcomes", () => {
  it("rejects an order outside the portfolio mandate", async () => {
    const option = await h.repos.instruments.create({ ...h.instruments.aapl, id: "ins_opt", symbol: "AAPL OPT", assetClass: "option" });
    const order = await h.services.orders.submit(h.principal("trader"), buy({ instrumentId: option.id }));
    expect(order.status).toBe("RISK_REJECTED");
    expect(order.rejectionReason).toMatch(/mandate/i);
    expect(order.riskChecks.some((c) => !c.passed)).toBe(true);
  });

  it("rejects orders on a frozen portfolio", async () => {
    await h.repos.portfolios.update(h.portfolio.id, { status: "frozen" });
    const order = await h.services.orders.submit(h.principal("trader"), buy());
    expect(order.status).toBe("RISK_REJECTED");
  });

  it("records a critical breach when risk blocks", async () => {
    await h.repos.portfolios.update(h.portfolio.id, { status: "frozen" });
    await h.services.orders.submit(h.principal("trader"), buy());
    const breaches = await h.repos.riskBreaches.list({ portfolioId: h.portfolio.id }, { limit: 10, offset: 0 });
    expect(breaches.total).toBeGreaterThan(0);
    expect(breaches.items[0].severity).toBe("critical");
  });

  it("blocks an order that would breach mandate concentration", async () => {
    // 25% of a 100M NAV is 25M; 200k * 2000 = 40M.
    const order = await h.services.orders.submit(h.principal("trader"), buy({ quantity: 200_000 }));
    expect(order.status).toBe("RISK_REJECTED");
    expect(order.rejectionReason).toMatch(/concentration|leverage/i);
  });
});

describe("OrderService.cancel", () => {
  it("cancels a resting order at the broker", async () => {
    h.brokers.configure((a) => (a.restLimits = true));
    const order = await h.services.orders.submit(h.principal("trader"), buy({ type: "LIMIT", limitPrice: 150 }));
    const cancelled = await h.services.orders.cancel(h.principal("trader"), order.id, "changed my mind");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.rejectionReason).toBe("changed my mind");
    expect(h.brokers.get("ibkr").cancelled).toContain(order.externalOrderId);
  });

  it("refuses to cancel a terminal order", async () => {
    const order = await h.services.orders.submit(h.principal("trader"), buy());
    await expect(h.services.orders.cancel(h.principal("trader"), order.id, "too late")).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("requires orders:cancel", async () => {
    h.brokers.configure((a) => (a.restLimits = true));
    const order = await h.services.orders.submit(h.principal("trader"), buy({ type: "LIMIT", limitPrice: 150 }));
    await expect(h.services.orders.cancel(h.principal("analyst"), order.id, "no")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("OrderService.closePosition", () => {
  it("submits an offsetting market order that flattens the book", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);

    const close = await h.services.orders.closePosition(h.principal("trader"), position!.id, "taking profit");
    expect(close.side).toBe("SELL");
    expect(close.quantity).toBe(100);
    expect(close.status).toBe("FILLED");
    expect(await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id)).toBeNull();
  });

  it("requires positions:close and an open position", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    await expect(h.services.orders.closePosition(h.principal("analyst"), position!.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.services.orders.closePosition(h.principal("trader"), "pos_missing", "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("tags a risk manager's unwind as risk_unwind", async () => {
    await h.services.orders.submit(h.principal("trader"), buy({ quantity: 100 }));
    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);
    const close = await h.services.orders.closePosition(h.principal("risk"), position!.id, "RISK: limit breach unwind");
    expect(close.origin).toBe("risk_unwind");
  });
});

describe("OrderService.list", () => {
  it("scopes to visible portfolios", async () => {
    await h.services.orders.submit(h.principal("trader"), buy());
    const mine = await h.services.orders.list(h.principal("trader"), {}, { limit: 50, offset: 0 });
    expect(mine.total).toBe(1);
    const theirs = await h.services.orders.list(h.principal("otherTrader"), {}, { limit: 50, offset: 0 });
    expect(theirs.total).toBe(0);
  });

  it("filters by status", async () => {
    await h.services.orders.submit(h.principal("trader"), buy());
    const filled = await h.services.orders.list(h.principal("admin"), { status: "FILLED" }, { limit: 50, offset: 0 });
    const cancelled = await h.services.orders.list(h.principal("admin"), { status: "CANCELLED" }, { limit: 50, offset: 0 });
    expect(filled.total).toBe(1);
    expect(cancelled.total).toBe(0);
  });
});
