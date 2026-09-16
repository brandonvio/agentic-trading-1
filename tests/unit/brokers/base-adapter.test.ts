import { describe, expect, it } from "vitest";
import { Fill } from "@/lib/domain/order";
import { InteractiveBrokersAdapter } from "@/lib/brokers/ibkr";
import { SPY, SPY_CALL, account, clockAt, order, simulator } from "./fixtures";

function ibkr(seed = 42, opts: { simulateLatency?: boolean; latencyMs?: number } = {}) {
  const clock = clockAt();
  const sim = simulator(clock, seed);
  return { clock, sim, adapter: new InteractiveBrokersAdapter({ simulator: sim, clock, ...opts }) };
}

describe("MockBrokerAdapter shared behaviour (via IBKR)", () => {
  it("fills MARKET buys fully at/above the ask with slippage, tick-rounded, with fill metadata", async () => {
    const { adapter, sim, clock } = ibkr();
    const spy = SPY();
    const quote = sim.quote(spy, clock.now());
    const res = await adapter.placeOrder({ order: order(spy, { quantity: 100 }), instrument: spy, account: account() });
    expect(res.accepted).toBe(true);
    if (!res.accepted) return;
    expect(res.status).toBe("FILLED");
    expect(res.externalOrderId).toMatch(/^IBKR-O-/);
    expect(res.fills).toHaveLength(1);
    const fill = Fill.parse(res.fills[0]);
    expect(fill.quantity).toBe(100);
    expect(fill.price).toBeGreaterThanOrEqual(quote.ask);
    expect(fill.price).toBeLessThanOrEqual(quote.ask * 1.0003);
    expect(Math.round(fill.price * 100) / 100).toBe(fill.price);
    expect(fill.venue).toBe("SMART");
    expect(fill.externalFillId).toMatch(/^IBKR-F-/);
    expect(fill.executedAt).toBe(clock.nowIso());
    expect(fill.orderId).toBe("ord_test");
    expect(fill.side).toBe("BUY");
  });

  it("fills MARKET sells at/below the bid", async () => {
    const { adapter, sim, clock } = ibkr();
    const spy = SPY();
    const quote = sim.quote(spy, clock.now());
    const res = await adapter.placeOrder({ order: order(spy, { side: "SELL", quantity: 50 }), instrument: spy, account: account() });
    expect(res.accepted && res.fills[0].price <= quote.bid).toBe(true);
  });

  it("rests non-marketable LIMIT orders and fills marketable ones at the better price", async () => {
    const { adapter, sim, clock } = ibkr();
    const spy = SPY();
    const quote = sim.quote(spy, clock.now());
    const resting = await adapter.placeOrder({
      order: order(spy, { type: "LIMIT", limitPrice: Math.round((quote.bid - 1) * 100) / 100 }),
      instrument: spy,
      account: account(),
    });
    expect(resting).toMatchObject({ accepted: true, status: "ACKNOWLEDGED", fills: [] });
    const marketable = await adapter.placeOrder({
      order: order(spy, { type: "LIMIT", limitPrice: Math.round((quote.ask + 1) * 100) / 100 }),
      instrument: spy,
      account: account(),
    });
    expect(marketable.accepted && marketable.status === "FILLED" && marketable.fills[0].price === quote.ask).toBe(true);
    const sell = await adapter.placeOrder({
      order: order(spy, { side: "SELL", type: "LIMIT", limitPrice: Math.round((quote.bid - 1) * 100) / 100 }),
      instrument: spy,
      account: account(),
    });
    expect(sell.accepted && sell.fills[0].price === quote.bid).toBe(true);
  });

  it("acknowledges STOP and STOP_LIMIT orders without fills", async () => {
    const { adapter } = ibkr();
    const spy = SPY();
    const stop = await adapter.placeOrder({ order: order(spy, { type: "STOP", stopPrice: 600 }), instrument: spy, account: account() });
    expect(stop).toMatchObject({ accepted: true, status: "ACKNOWLEDGED", fills: [] });
    const stopLimit = await adapter.placeOrder({
      order: order(spy, { type: "STOP_LIMIT", stopPrice: 600, limitPrice: 599 }),
      instrument: spy,
      account: account(),
    });
    expect(stopLimit).toMatchObject({ accepted: true, status: "ACKNOWLEDGED", fills: [] });
  });

  it("partially fills large notional orders (60–90%)", async () => {
    const { adapter } = ibkr();
    const spy = SPY();
    const res = await adapter.placeOrder({
      order: order(spy, { quantity: 5000 }), // ~$3.1M > $500k threshold
      instrument: spy,
      account: account({ buyingPower: 10_000_000 }),
    });
    expect(res.accepted).toBe(true);
    if (!res.accepted) return;
    expect(res.status).toBe("PARTIALLY_FILLED");
    expect(res.fills[0].quantity).toBeGreaterThanOrEqual(3000);
    expect(res.fills[0].quantity).toBeLessThanOrEqual(4500);
    expect(Number.isInteger(res.fills[0].quantity)).toBe(true);
  });

  it("rejects with INSUFFICIENT_MARGIN when notional exceeds buying power", async () => {
    const { adapter } = ibkr();
    const spy = SPY();
    const res = await adapter.placeOrder({ order: order(spy, { quantity: 100 }), instrument: spy, account: account({ buyingPower: 1000 }) });
    expect(res).toMatchObject({ accepted: false, code: "INSUFFICIENT_MARGIN" });
  });

  it("rejects INVALID_ORDER for bad lot size, off-tick limits, missing prices and untradable instruments", async () => {
    const { adapter } = ibkr();
    const lots = SPY({ lotSize: 100 });
    expect(await adapter.placeOrder({ order: order(lots, { quantity: 150 }), instrument: lots, account: account() })).toMatchObject({
      accepted: false,
      code: "INVALID_ORDER",
    });
    const spy = SPY();
    expect(await adapter.placeOrder({ order: order(spy, { type: "LIMIT", limitPrice: 600.001 }), instrument: spy, account: account() })).toMatchObject({
      accepted: false,
      code: "INVALID_ORDER",
    });
    expect(await adapter.placeOrder({ order: order(spy, { type: "LIMIT" }), instrument: spy, account: account() })).toMatchObject({
      accepted: false,
      code: "INVALID_ORDER",
    });
    expect(await adapter.placeOrder({ order: order(spy, { type: "STOP" }), instrument: spy, account: account() })).toMatchObject({
      accepted: false,
      code: "INVALID_ORDER",
    });
    const halted = SPY({ tradable: false });
    expect(await adapter.placeOrder({ order: order(halted), instrument: halted, account: account() })).toMatchObject({ accepted: false, code: "INVALID_ORDER" });
  });

  it("rejects instruments routed to another venue or asset class", async () => {
    const { adapter } = ibkr();
    const wrong = SPY({ broker: "coinbase" });
    expect(await adapter.placeOrder({ order: order(wrong), instrument: wrong, account: account() })).toMatchObject({ accepted: false, code: "REJECTED_BY_VENUE" });
  });

  it("rejects with CONNECTIVITY when the account or adapter is disconnected", async () => {
    const { adapter } = ibkr();
    const spy = SPY();
    expect(await adapter.placeOrder({ order: order(spy), instrument: spy, account: account({ status: "disconnected" }) })).toMatchObject({
      accepted: false,
      code: "CONNECTIVITY",
    });
    adapter.setStatus("disconnected");
    expect(await adapter.placeOrder({ order: order(spy), instrument: spy, account: account() })).toMatchObject({ accepted: false, code: "CONNECTIVITY" });
  });

  it("fails intermittently on degraded accounts but never on connected/paper ones", async () => {
    const spy = SPY();
    const run = async (status: "connected" | "paper" | "degraded") => {
      const { adapter } = ibkr(7);
      let failures = 0;
      for (let i = 0; i < 100; i++) {
        const res = await adapter.placeOrder({ order: order(spy, { quantity: 1 }), instrument: spy, account: account({ status }) });
        if (!res.accepted && res.code === "CONNECTIVITY") failures++;
      }
      return failures;
    };
    expect(await run("connected")).toBe(0);
    expect(await run("paper")).toBe(0);
    const degraded = await run("degraded");
    expect(degraded).toBeGreaterThan(0);
    expect(degraded).toBeLessThan(50);
  });

  it("is deterministic for a given seed and clock", async () => {
    const spy = SPY();
    const a = await ibkr(9).adapter.placeOrder({ order: order(spy, { quantity: 5000 }), instrument: spy, account: account({ buyingPower: 1e7 }) });
    const b = await ibkr(9).adapter.placeOrder({ order: order(spy, { quantity: 5000 }), instrument: spy, account: account({ buyingPower: 1e7 }) });
    expect(a).toEqual(b);
  });

  it("cancelOrder always reports cancelled", async () => {
    const { adapter } = ibkr();
    const spy = SPY();
    const placed = await adapter.placeOrder({ order: order(spy, { type: "LIMIT", limitPrice: 500 }), instrument: spy, account: account() });
    if (!placed.accepted) throw new Error("expected accepted");
    expect(await adapter.cancelOrder(placed.externalOrderId)).toMatchObject({ cancelled: true });
    expect(await adapter.cancelOrder("IBKR-O-unknown")).toMatchObject({ cancelled: true });
  });

  it("reports health from the settable status with latency in band and a session message", async () => {
    const { adapter, clock } = ibkr();
    const h = await adapter.health();
    expect(h.broker).toBe("ibkr");
    expect(h.status).toBe("connected");
    expect(h.latencyMs).toBeGreaterThanOrEqual(120 * 0.6);
    expect(h.latencyMs).toBeLessThanOrEqual(120 * 1.6);
    expect(h.lastHeartbeatAt).toBe(clock.nowIso());
    expect(h.message).toContain("regular trading hours");
    adapter.setStatus("degraded");
    expect((await adapter.health()).status).toBe("degraded");
    expect(adapter.getStatus()).toBe("degraded");
    clock.set("2026-09-03T22:00:00Z");
    expect((await adapter.health()).message).toContain("outside regular trading hours");
  });

  it("returns an account snapshot with tiny jitter and no positions by default", async () => {
    const { adapter } = ibkr();
    const snap = await adapter.getAccountSnapshot(account());
    expect(snap.externalAccountId).toBe("U1234567");
    expect(Math.abs(snap.cashBalance - 1_000_000)).toBeLessThan(200);
    expect(Math.abs(snap.buyingPower - 2_000_000)).toBeLessThan(400);
    expect(snap.marginUsed).toBeGreaterThanOrEqual(0);
    expect(snap.positions).toEqual([]);
  });

  it("serves quotes and bars from the simulator using the clock", async () => {
    const { adapter, sim, clock } = ibkr();
    const spy = SPY();
    expect(await adapter.getQuote(spy)).toEqual(sim.quote(spy, clock.now()));
    const quotes = await adapter.getQuotes([spy, SPY_CALL()]);
    expect(quotes.map((q) => q.symbol)).toEqual([spy.symbol, SPY_CALL().symbol]);
    const bars = await adapter.getBars(spy, "1h", 5);
    expect(bars).toEqual(sim.bars(spy, "1h", 5, clock.now()));
    const earlier = await adapter.getBars(spy, "1h", 5, "2026-09-02T14:00:00Z");
    expect(earlier.at(-1)?.time).toBe("2026-09-02T14:00:00.000Z");
  });

  it("only sleeps when simulateLatency is on", async () => {
    const { adapter } = ibkr(42, { simulateLatency: true, latencyMs: 20 });
    const start = performance.now();
    await adapter.health();
    expect(performance.now() - start).toBeGreaterThanOrEqual(15);
  });
});
