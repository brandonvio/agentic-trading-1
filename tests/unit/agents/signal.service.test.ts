/** SignalServiceImpl: visibility, acting on a signal and dismissing one. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Signal } from "@/lib/domain/agent";
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import { at, makeSignal } from "@/tests/fixtures/entities";
import { createAgentWorld, type AgentWorld } from "./fakes";

let world: AgentWorld;
const PAGE = { limit: 50, offset: 0 };

beforeEach(async () => {
  world = await createAgentWorld();
});

async function seedSignal(overrides: Partial<Signal> = {}): Promise<Signal> {
  return world.repos.signals.create(
    makeSignal({
      portfolioId: world.portfolio.id,
      instrumentId: "ins_aapl",
      symbol: "AAPL",
      assetClass: "equity",
      agentId: "agt_signals",
      runId: "run_1",
      entryPrice: 200,
      suggestedQuantity: 2_500,
      suggestedNotional: 500_000,
      createdAt: world.clock.nowIso(),
      expiresAt: at(60 * 48),
      ...overrides,
    }),
  );
}

describe("get / list", () => {
  it("requires agents:read and portfolio visibility", async () => {
    const signal = await seedSignal();
    await expect(world.signalService.get({ ...world.principal("pm"), permissions: [] }, signal.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.signalService.get(world.principal("otherTrader"), signal.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.signalService.get(world.principal("analyst"), signal.id)).resolves.toMatchObject({ id: signal.id });
    await expect(world.signalService.get(world.principal("pm"), "sig_nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only signals on visible portfolios, newest first", async () => {
    const mine = await seedSignal();
    await seedSignal({ portfolioId: world.otherPortfolio.id });
    const page = await world.signalService.list(world.principal("pm"), {}, PAGE);
    expect(page.items.map((s) => s.id)).toEqual([mine.id]);
    expect((await world.signalService.list(world.principal("admin"), {}, PAGE)).total).toBe(2);
  });

  it("filters by status, agent and instrument", async () => {
    await seedSignal({ status: "new" });
    await seedSignal({ status: "acted", agentId: "agt_other", instrumentId: "ins_btc", symbol: "BTC-USD", assetClass: "crypto" });
    expect((await world.signalService.list(world.principal("pm"), { status: "new" }, PAGE)).total).toBe(1);
    expect((await world.signalService.list(world.principal("pm"), { agentId: "agt_other" }, PAGE)).total).toBe(1);
    expect((await world.signalService.list(world.principal("pm"), { instrumentId: "ins_btc" }, PAGE)).total).toBe(1);
  });
});

describe("act", () => {
  it("submits an agent-origin order linked to the signal and marks it acted", async () => {
    const signal = await seedSignal();
    const order = await world.signalService.act(world.principal("pm"), signal.id);

    expect(order).toMatchObject({
      portfolioId: world.portfolio.id,
      instrumentId: "ins_aapl",
      side: "BUY",
      type: "MARKET",
      quantity: 2_500,
      origin: "agent",
      signalId: signal.id,
      agentRunId: "run_1",
    });
    expect(order.rationale).toContain(signal.id);
    expect(world.orders.calls[0].via).toBe("principal");
    expect((await world.repos.signals.findById(signal.id))?.status).toBe("acted");
  });

  it("uses strategy origin for signals with no agent", async () => {
    const signal = await seedSignal({ agentId: null, runId: null, strategyId: "strat_mom" });
    const order = await world.signalService.act(world.principal("pm"), signal.id);
    expect(order).toMatchObject({ origin: "strategy", strategyId: "strat_mom", agentRunId: null });
  });

  it("derives the side from the direction when the signal has none", async () => {
    const short = await seedSignal({ direction: "SHORT", side: null });
    expect((await world.signalService.act(world.principal("pm"), short.id)).side).toBe("SELL");
  });

  it("honours quantity, type and limit overrides", async () => {
    const signal = await seedSignal();
    const order = await world.signalService.act(world.principal("pm"), signal.id, { quantity: 100, type: "LIMIT", limitPrice: 199 });
    expect(order).toMatchObject({ quantity: 100, type: "LIMIT", limitPrice: 199 });
  });

  it("defaults a LIMIT order to the signal's entry price", async () => {
    const signal = await seedSignal();
    const order = await world.signalService.act(world.principal("pm"), signal.id, { type: "LIMIT" });
    expect(order.limitPrice).toBe(200);
  });

  it("requires orders:create", async () => {
    const signal = await seedSignal();
    await expect(world.signalService.act(world.principal("analyst"), signal.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses signals that are not new, are expired, or cannot be sized", async () => {
    const acted = await seedSignal({ status: "acted" });
    await expect(world.signalService.act(world.principal("pm"), acted.id)).rejects.toBeInstanceOf(InvalidStateError);

    const expired = await seedSignal({ expiresAt: "2026-08-31T00:00:00.000Z" });
    await expect(world.signalService.act(world.principal("pm"), expired.id)).rejects.toBeInstanceOf(InvalidStateError);

    const flat = await seedSignal({ direction: "FLAT", side: null });
    await expect(world.signalService.act(world.principal("pm"), flat.id)).rejects.toBeInstanceOf(ValidationError);

    const sizeless = await seedSignal({ suggestedQuantity: 0 });
    await expect(world.signalService.act(world.principal("pm"), sizeless.id)).rejects.toBeInstanceOf(ValidationError);

    const unscoped = await seedSignal({ portfolioId: null });
    await expect(world.signalService.act(world.principal("admin"), unscoped.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("leaves the signal alone when the order pipeline throws", async () => {
    const signal = await seedSignal();
    await world.repos.signals.update(signal.id, { instrumentId: "ins_missing" });
    await expect(world.signalService.act(world.principal("pm"), signal.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await world.repos.signals.findById(signal.id))?.status).toBe("new");
  });

  it("returns a risk-rejected order rather than throwing", async () => {
    world.orders.outcome = { status: "RISK_REJECTED", rejectionReason: "concentration" };
    const signal = await seedSignal();
    const order = await world.signalService.act(world.principal("pm"), signal.id);
    expect(order).toMatchObject({ status: "RISK_REJECTED", rejectionReason: "concentration" });
    expect((await world.repos.signals.findById(signal.id))?.status).toBe("acted");
  });
});

describe("dismiss", () => {
  it("lets anyone who can act on a signal clear it, and records the reason", async () => {
    // The gate matches app/api/signals/[id]/dismiss: a trader who may act on a
    // signal may also dismiss it. Read-only roles may not.
    const forTrader = await seedSignal();
    const byTrader = await world.signalService.dismiss(world.principal("trader"), forTrader.id, "Duplicate of an existing ticket");
    expect(byTrader.status).toBe("dismissed");

    const forPm = await seedSignal();
    const byPm = await world.signalService.dismiss(world.principal("pm"), forPm.id, "Duplicates existing AAPL exposure");
    expect(byPm.status).toBe("dismissed");

    const forAnalyst = await seedSignal();
    await expect(world.signalService.dismiss(world.principal("analyst"), forAnalyst.id, "no")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an empty reason and a signal that is not new", async () => {
    const signal = await seedSignal();
    await expect(world.signalService.dismiss(world.principal("pm"), signal.id, "   ")).rejects.toBeInstanceOf(ValidationError);
    await world.repos.signals.update(signal.id, { status: "acted" });
    await expect(world.signalService.dismiss(world.principal("pm"), signal.id, "too late")).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("honours portfolio visibility", async () => {
    const foreign = await seedSignal({ portfolioId: world.otherPortfolio.id });
    await expect(world.signalService.dismiss(world.principal("pm"), foreign.id, "not mine")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
