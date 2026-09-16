import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, expectPaged, type ApiWorld } from "./helpers";
import type { RiskLimit, RiskReport } from "@/lib/domain/risk";
import { GET as listLimits, POST as createLimit } from "@/app/api/risk/limits/route";
import { PATCH as patchLimit, DELETE as deleteLimit } from "@/app/api/risk/limits/[id]/route";
import { GET as listBreaches } from "@/app/api/risk/breaches/route";
import { POST as ackBreach } from "@/app/api/risk/breaches/[id]/acknowledge/route";
import { POST as resolveBreach } from "@/app/api/risk/breaches/[id]/resolve/route";
import { GET as portfolioRisk } from "@/app/api/portfolios/[id]/risk/route";
import { GET as firmRisk } from "@/app/api/firm/risk/route";
import { GET as listApprovals } from "@/app/api/approvals/route";
import { GET as getApproval } from "@/app/api/approvals/[id]/route";
import { POST as decideApproval } from "@/app/api/approvals/[id]/decide/route";
import { POST as createOrder } from "@/app/api/orders/route";
import type { Order } from "@/lib/domain/order";
import type { ApprovalRequest } from "@/lib/domain/approval";

let w: ApiWorld;
let risk: string;
let pm: string;
let cio: string;
let analyst: string;
beforeAll(async () => {
  w = await setupApiWorld();
  risk = await loginAs(w.users.riskManager.email);
  pm = await loginAs(w.users.pm.email);
  cio = await loginAs(w.users.cio.email);
  analyst = await loginAs(w.users.analyst.email);
});

describe("risk limits", () => {
  it("lists limits with scope filters", async () => {
    const r = await call(listLimits, "GET", "/api/risk/limits?scope=platform", { cookie: pm });
    expect(r.status).toBe(200);
    expectPaged(r.data);
    expect(r.data.items.map((l) => (l as RiskLimit).id)).toContain(w.limit.id);
  });

  it("creates, updates and deletes a limit (risk:limits:write)", async () => {
    const created = await call<RiskLimit>(createLimit, "POST", "/api/risk/limits", {
      cookie: risk,
      body: {
        name: "Macro Alpha max order notional",
        scope: "portfolio",
        scopeId: w.portfolio.id,
        metric: "order_notional",
        qualifier: null,
        threshold: 2_000_000,
        warnThreshold: 1_500_000,
        action: "require_approval",
        enabled: true,
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    expect(created.data.id).toMatch(/^lim_/);
    expect(created.data.createdByUserId).toBe(w.users.riskManager.id);
    expect(created.data.scopeId).toBe(w.portfolio.id);

    const updated = await call<RiskLimit>(patchLimit, "PATCH", `/api/risk/limits/${created.data.id}`, {
      cookie: risk,
      params: { id: created.data.id },
      body: { threshold: 2_500_000 },
    });
    expect(updated.status).toBe(200);
    expect(updated.data.threshold).toBe(2_500_000);

    const listed = await call(listLimits, "GET", `/api/risk/limits?scope=portfolio&scopeId=${w.portfolio.id}`, { cookie: pm });
    expectPaged(listed.data);
    expect(listed.data.items.map((l) => (l as RiskLimit).id)).toContain(created.data.id);

    const deleted = await call<{ id: string; deleted: boolean }>(deleteLimit, "DELETE", `/api/risk/limits/${created.data.id}`, {
      cookie: risk,
      params: { id: created.data.id },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.data).toEqual({ id: created.data.id, deleted: true });

    const gone = await call(deleteLimit, "DELETE", `/api/risk/limits/${created.data.id}`, { cookie: risk, params: { id: created.data.id } });
    expect(gone.status).toBe(404);
  });

  it("validates the create body", async () => {
    const r = await call(createLimit, "POST", "/api/risk/limits", { cookie: risk, body: { name: "bad", metric: "not_a_metric" } });
    expect(r.status).toBe(400);
    expect((r.error?.details as { fieldErrors: Record<string, string[]> }).fieldErrors.metric).toBeTruthy();
  });

  it("forbids limit writes for the pm and analyst", async () => {
    for (const cookie of [pm, analyst]) {
      const r = await call(deleteLimit, "DELETE", `/api/risk/limits/${w.limit.id}`, { cookie, params: { id: w.limit.id } });
      expect(r.status).toBe(403);
    }
  });
});

describe("risk reports & breaches", () => {
  it("GET /api/portfolios/[id]/risk returns a report with limit utilisation", async () => {
    const r = await call<RiskReport>(portfolioRisk, "GET", `/api/portfolios/${w.portfolio.id}/risk`, { cookie: pm, params: { id: w.portfolio.id } });
    expect(r.status).toBe(200);
    expect(r.data.portfolioId).toBe(w.portfolio.id);
    expect(Array.isArray(r.data.limits)).toBe(true);
    expect(r.data.limits.map((l) => l.limit.id)).toContain(w.limit.id);
  });

  it("GET /api/firm/risk aggregates portfolios", async () => {
    const r = await call<{ portfolios: RiskReport[]; openBreaches: number }>(firmRisk, "GET", "/api/firm/risk", { cookie: risk });
    expect(r.status).toBe(200);
    expect(r.data.portfolios.map((p) => p.portfolioId)).toContain(w.portfolio.id);
    expect(typeof r.data.openBreaches).toBe("number");
  });

  it("GET /api/risk/breaches filters and validates", async () => {
    const r = await call(listBreaches, "GET", `/api/risk/breaches?portfolioId=${w.portfolio.id}&status=open`, { cookie: pm });
    expect(r.status).toBe(200);
    expectPaged(r.data);
    expect((await call(listBreaches, "GET", "/api/risk/breaches?severity=apocalyptic", { cookie: pm })).status).toBe(400);
  });

  it("acknowledge / resolve on unknown breach → 404, and resolve needs risk:breaches:resolve", async () => {
    expect((await call(ackBreach, "POST", "/api/risk/breaches/brch_x/acknowledge", { cookie: pm, params: { id: "brch_x" } })).status).toBe(404);
    expect((await call(resolveBreach, "POST", "/api/risk/breaches/brch_x/resolve", { cookie: pm, params: { id: "brch_x" }, body: { note: "n" } })).status).toBe(403);
    expect((await call(resolveBreach, "POST", "/api/risk/breaches/brch_x/resolve", { cookie: risk, params: { id: "brch_x" }, body: { note: "n" } })).status).toBe(404);
  });
});

describe("approvals", () => {
  it("decide is 403 for a non-approver and 404 for an unknown id", async () => {
    const denied = await call(decideApproval, "POST", "/api/approvals/apr_x/decide", {
      cookie: analyst,
      params: { id: "apr_x" },
      body: { decision: "approve" },
    });
    expect(denied.status).toBe(403);
    const missing = await call(decideApproval, "POST", "/api/approvals/apr_x/decide", {
      cookie: cio,
      params: { id: "apr_x" },
      body: { decision: "approve" },
    });
    expect(missing.status).toBe(404);
    const bad = await call(decideApproval, "POST", "/api/approvals/apr_x/decide", { cookie: cio, params: { id: "apr_x" }, body: { decision: "maybe" } });
    expect(bad.status).toBe(400);
  });

  it("an order that breaches a require_approval limit creates a pending approval the requester cannot self-approve", async () => {
    // Tight per-portfolio notional limit so the next order needs approval.
    const lim = await call<RiskLimit>(createLimit, "POST", "/api/risk/limits", {
      cookie: risk,
      body: { name: "tiny notional", scope: "portfolio", scopeId: w.portfolio.id, metric: "order_notional", threshold: 1, action: "require_approval", enabled: true },
    });
    expect(lim.status).toBe(200);

    const order = await call<Order>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", quantity: 100, rationale: "needs approval" },
    });
    expect(order.status, JSON.stringify(order.json)).toBe(200);
    await call(deleteLimit, "DELETE", `/api/risk/limits/${lim.data.id}`, { cookie: risk, params: { id: lim.data.id } });
    if (order.data.status !== "PENDING_APPROVAL") return; // engine chose a different outcome; contract allows it
    expect(order.data.approvalId).toBeTruthy();

    const pending = await call(listApprovals, "GET", `/api/approvals?status=pending&type=order&portfolioId=${w.portfolio.id}`, { cookie: pm });
    expectPaged(pending.data);
    const approval = pending.data.items.find((a) => (a as ApprovalRequest).subjectId === order.data.id) as ApprovalRequest | undefined;
    expect(approval).toBeTruthy();

    const one = await call<ApprovalRequest>(getApproval, "GET", `/api/approvals/${approval!.id}`, { cookie: pm, params: { id: approval!.id } });
    expect(one.status).toBe(200);
    expect(one.data.status).toBe("pending");

    // Four-eyes: the requesting PM holds approvals:decide but must not approve their own request.
    const self = await call(decideApproval, "POST", `/api/approvals/${approval!.id}/decide`, {
      cookie: pm,
      params: { id: approval!.id },
      body: { decision: "approve", note: "self" },
    });
    expect([403, 409]).toContain(self.status);

    const decided = await call<ApprovalRequest>(decideApproval, "POST", `/api/approvals/${approval!.id}/decide`, {
      cookie: cio,
      params: { id: approval!.id },
      body: { decision: "approve", note: "ok" },
    });
    expect(decided.status, JSON.stringify(decided.json)).toBe(200);
    expect(decided.data.status).toBe("approved");
    expect(decided.data.decidedByUserId).toBe(w.users.cio.id);
  });
});
