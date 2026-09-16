import { describe, it, expect, beforeEach } from "vitest";
import { createHarness, type Harness } from "./harness";
import { ForbiddenError, InvalidStateError } from "@/lib/core/errors";
import type { CreateOrderInput } from "@/lib/domain/order";
import { buildAgent, buildAgentRun } from "@/tests/fixtures/entities";

let h: Harness;

beforeEach(async () => {
  h = await createHarness({ broker: { price: 200, commission: 5 } });
});

const order = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
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

/** A limit that forces approval for any order above a small notional. */
async function requireApprovalAbove(threshold: number) {
  await h.repos.riskLimits.create({
    id: "lim_approve",
    name: "Order notional requires approval",
    scope: "portfolio",
    scopeId: h.portfolio.id,
    metric: "order_notional",
    qualifier: null,
    threshold,
    warnThreshold: null,
    action: "require_approval",
    enabled: true,
    createdByUserId: h.users.risk.id,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  });
}

describe("order approval flow", () => {
  it("parks the order pending approval and creates the request", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());

    expect(submitted.status).toBe("PENDING_APPROVAL");
    expect(submitted.approvalId).not.toBeNull();
    expect(h.brokers.get("ibkr").placed).toHaveLength(0);

    const approval = await h.repos.approvals.findById(submitted.approvalId!);
    expect(approval?.type).toBe("order");
    expect(approval?.status).toBe("pending");
    expect(approval?.notional).toBe(200_000);
    expect(approval?.riskSummary).toMatch(/notional/i);
  });

  it("routes the order once a different user approves", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());

    await h.services.approvals.decide(h.principal("pm"), submitted.approvalId!, { decision: "approve", note: "size is fine" });

    const routed = await h.repos.orders.findById(submitted.id);
    expect(routed?.status).toBe("FILLED");
    expect(routed?.filledQuantity).toBe(1000);
    expect(h.brokers.get("ibkr").placed).toHaveLength(1);
  });

  it("marks the order approval-rejected when declined", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());

    await h.services.approvals.decide(h.principal("pm"), submitted.approvalId!, { decision: "reject", note: "too much risk" });

    const rejected = await h.repos.orders.findById(submitted.id);
    expect(rejected?.status).toBe("APPROVAL_REJECTED");
    expect(rejected?.rejectionReason).toBe("too much risk");
    expect(h.brokers.get("ibkr").placed).toHaveLength(0);
  });

  it("enforces four-eyes: the requester cannot decide", async () => {
    await requireApprovalAbove(50_000);
    // The PM both submits and tries to approve.
    const submitted = await h.services.orders.submit(h.principal("pm"), order());
    await expect(
      h.services.approvals.decide(h.principal("pm"), submitted.approvalId!, { decision: "approve", note: "self" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires approvals:decide", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());
    await expect(
      h.services.approvals.decide(h.principal("analyst"), submitted.approvalId!, { decision: "approve", note: "" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a second decision on the same request", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());
    await h.services.approvals.decide(h.principal("pm"), submitted.approvalId!, { decision: "approve", note: "" });
    await expect(
      h.services.approvals.decide(h.principal("cio"), submitted.approvalId!, { decision: "reject", note: "" }),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("expires an approval past its deadline", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());
    h.clock.advance(25 * 60 * 60 * 1000);
    await expect(
      h.services.approvals.decide(h.principal("pm"), submitted.approvalId!, { decision: "approve", note: "" }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    const approval = await h.repos.approvals.findById(submitted.approvalId!);
    expect(approval?.status).toBe("expired");
  });

  it("withdraws the approval when the order is cancelled", async () => {
    await requireApprovalAbove(50_000);
    const submitted = await h.services.orders.submit(h.principal("trader"), order());
    await h.services.orders.cancel(h.principal("trader"), submitted.id, "no longer needed");
    const approval = await h.repos.approvals.findById(submitted.approvalId!);
    expect(approval?.status).toBe("cancelled");
  });

  it("counts pending approvals within the principal's scope", async () => {
    await requireApprovalAbove(50_000);
    await h.services.orders.submit(h.principal("trader"), order());
    expect(await h.services.approvals.pendingCount(h.principal("pm"))).toBe(1);
    expect(await h.services.approvals.pendingCount(h.principal("otherTrader"))).toBe(0);
  });
});

describe("agent autonomy gates", () => {
  async function seedAgent(autonomy: "advisory" | "supervised" | "autonomous", over: Record<string, unknown> = {}) {
    const agent = await h.repos.agents.create(
      buildAgent({
        id: `agt_${autonomy}`,
        kind: "execution",
        name: `${autonomy} executor`,
        autonomy,
        portfolioId: h.portfolio.id,
        deskId: h.desk.id,
        ownerUserId: h.users.pm.id,
        maxNotionalPerRun: 0,
        ...over,
      }),
    );
    const run = await h.repos.agentRuns.create(
      buildAgentRun({ id: `run_${autonomy}`, agentId: agent.id, agentKind: "execution", agentName: agent.name, portfolioId: h.portfolio.id, orderIds: [] }),
    );
    return { agent, run };
  }

  it("blocks advisory agents from trading", async () => {
    const { agent, run } = await seedAgent("advisory");
    const result = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent" }));
    expect(result.status).toBe("RISK_REJECTED");
    expect(result.rejectionReason).toMatch(/advisory/i);
  });

  it("sends supervised agent orders to approval", async () => {
    const { agent, run } = await seedAgent("supervised");
    const result = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent" }));
    expect(result.status).toBe("PENDING_APPROVAL");
    const approval = await h.repos.approvals.findById(result.approvalId!);
    expect(approval?.requestedBy.kind).toBe("agent");
  });

  it("lets autonomous agents trade within the mandate threshold", async () => {
    const { agent, run } = await seedAgent("autonomous");
    const result = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent" }));
    expect(result.status).toBe("FILLED");
    expect(result.createdBy.kind).toBe("agent");
    expect(result.origin).toBe("agent");
  });

  it("requires approval above the portfolio's agent threshold", async () => {
    const { agent, run } = await seedAgent("autonomous");
    // 40,000 * 200 = 8M > the 5M threshold in the harness mandate.
    const result = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent", quantity: 40_000 }));
    expect(result.status).toBe("PENDING_APPROVAL");
  });

  it("blocks agents when the portfolio disables agent trading", async () => {
    await h.repos.portfolios.update(h.portfolio.id, { mandate: { ...h.portfolio.mandate, agentTradingEnabled: false } });
    const { agent, run } = await seedAgent("autonomous");
    const result = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent" }));
    expect(result.status).toBe("RISK_REJECTED");
    expect(result.rejectionReason).toMatch(/agent trading is disabled/i);
  });

  it("enforces the per-run notional budget", async () => {
    const { agent, run } = await seedAgent("autonomous", { maxNotionalPerRun: 300_000 });
    const first = await h.services.orders.submitForAgent(agent, run, order({ origin: "agent" }));
    expect(first.status).toBe("FILLED");

    await h.repos.agentRuns.update(run.id, { orderIds: [first.id] });
    const reloaded = (await h.repos.agentRuns.findById(run.id))!;
    const second = await h.services.orders.submitForAgent(agent, reloaded, order({ origin: "agent" }));
    expect(second.status).toBe("RISK_REJECTED");
    expect(second.rejectionReason).toMatch(/budget/i);
  });

  it("refuses to trade a portfolio the agent is not scoped to", async () => {
    const { agent, run } = await seedAgent("autonomous");
    const other = await h.repos.portfolios.create({ ...h.portfolio, id: "pf_other", code: "OTHER" });
    await expect(h.services.orders.submitForAgent(agent, run, order({ portfolioId: other.id, origin: "agent" }))).rejects.toThrow(/scoped/i);
  });
});
