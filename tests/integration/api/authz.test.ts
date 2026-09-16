import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, type ApiWorld } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as decideApproval } from "@/app/api/approvals/[id]/decide/route";
import { POST as createLimit } from "@/app/api/risk/limits/route";
import { POST as createUser } from "@/app/api/users/route";
import { GET as listAudit } from "@/app/api/audit/route";
import { POST as killRun } from "@/app/api/agent-runs/[id]/kill/route";
import { PATCH as patchAccount } from "@/app/api/brokers/accounts/[id]/route";

let w: ApiWorld;
const cookies: Record<string, string> = {};
beforeAll(async () => {
  w = await setupApiWorld();
  for (const [k, u] of Object.entries(w.users)) cookies[k] = await loginAs(u.email);
});

describe("permission gate (403)", () => {
  it("analyst cannot POST /api/orders", async () => {
    const r = await call(createOrder, "POST", "/api/orders", {
      cookie: cookies.analyst,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", quantity: 1 },
    });
    expect(r.status).toBe(403);
    expect(r.error?.code).toBe("FORBIDDEN");
    expect((r.error?.details as { required: string[] }).required).toEqual(["orders:create"]);
  });

  it("analyst / trader cannot decide approvals", async () => {
    for (const who of ["analyst", "trader"]) {
      const r = await call(decideApproval, "POST", "/api/approvals/apr_x/decide", {
        cookie: cookies[who],
        params: { id: "apr_x" },
        body: { decision: "approve", note: "lgtm" },
      });
      expect(r.status, who).toBe(403);
      expect(r.error?.code).toBe("FORBIDDEN");
    }
  });

  it("portfolio manager cannot write risk limits", async () => {
    const r = await call(createLimit, "POST", "/api/risk/limits", {
      cookie: cookies.pm,
      body: { name: "x", scope: "platform", scopeId: null, metric: "order_notional", threshold: 1, action: "warn", enabled: true },
    });
    expect(r.status).toBe(403);
  });

  it("trader cannot manage users", async () => {
    const r = await call(createUser, "POST", "/api/users", {
      cookie: cookies.trader,
      body: { email: "new@example.test", name: "New", title: "Intern", roles: ["analyst"] },
    });
    expect(r.status).toBe(403);
  });

  it("trader cannot read the audit log, compliance can", async () => {
    expect((await call(listAudit, "GET", "/api/audit", { cookie: cookies.trader })).status).toBe(403);
    expect((await call(listAudit, "GET", "/api/audit", { cookie: cookies.compliance })).status).toBe(200);
  });

  it("analyst cannot kill agent runs; risk manager passes the gate", async () => {
    const forbidden = await call(killRun, "POST", "/api/agent-runs/run_x/kill", {
      cookie: cookies.analyst,
      params: { id: "run_x" },
      body: { reason: "stop" },
    });
    expect(forbidden.status).toBe(403);
    const allowed = await call(killRun, "POST", "/api/agent-runs/run_x/kill", {
      cookie: cookies.riskManager,
      params: { id: "run_x" },
      body: { reason: "stop" },
    });
    // Past the permission gate: the service decides (unknown run → 404).
    expect(allowed.status).toBe(404);
  });

  it("only brokers:manage may change account status", async () => {
    const path = `/api/brokers/accounts/${w.accounts.ibkr.id}`;
    const denied = await call(patchAccount, "PATCH", path, { cookie: cookies.pm, params: { id: w.accounts.ibkr.id }, body: { status: "degraded" } });
    expect(denied.status).toBe(403);
    const ok = await call<{ status: string }>(patchAccount, "PATCH", path, {
      cookie: cookies.ops,
      params: { id: w.accounts.ibkr.id },
      body: { status: "degraded" },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.status).toBe("degraded");
    // restore for other suites in this file
    await call(patchAccount, "PATCH", path, { cookie: cookies.ops, params: { id: w.accounts.ibkr.id }, body: { status: "connected" } });
  });
});

describe("validation (400)", () => {
  it("rejects an invalid order body with field-level details", async () => {
    const r = await call(createOrder, "POST", "/api/orders", {
      cookie: cookies.pm,
      body: { portfolioId: w.portfolio.id, side: "UP", quantity: -5 },
    });
    expect(r.status).toBe(400);
    expect(r.error?.code).toBe("VALIDATION_ERROR");
    const details = r.error?.details as { fieldErrors: Record<string, string[]>; formErrors: string[] };
    expect(details.fieldErrors.side).toBeTruthy();
    expect(details.fieldErrors.quantity).toBeTruthy();
    expect(details.fieldErrors.instrumentId).toBeTruthy();
  });

  it("rejects non-JSON bodies", async () => {
    const r = await call(createOrder, "POST", "/api/orders", { cookie: cookies.pm, body: "{not json" });
    expect(r.status).toBe(400);
    expect(r.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid enum in a body", async () => {
    const r = await call(patchAccount, "PATCH", `/api/brokers/accounts/${w.accounts.ibkr.id}`, {
      cookie: cookies.ops,
      params: { id: w.accounts.ibkr.id },
      body: { status: "on-fire" },
    });
    expect(r.status).toBe(400);
  });

  it("rejects an invalid enum in the query string", async () => {
    const { GET: listOrders } = await import("@/app/api/orders/route");
    const r = await call(listOrders, "GET", "/api/orders?status=NOPE", { cookie: cookies.pm });
    expect(r.status).toBe(400);
    expect(r.error?.message).toBe("Invalid query");
  });
});
