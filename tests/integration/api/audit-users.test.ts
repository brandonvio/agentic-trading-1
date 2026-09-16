import { beforeAll, describe, expect, it } from "vitest";
import { setupApiWorld, call, loginAs, expectPaged, type ApiWorld } from "./helpers";
import type { AuditEvent } from "@/lib/domain/audit";
import type { User } from "@/lib/domain/auth";
import { GET as listAudit } from "@/app/api/audit/route";
import { POST as createUser } from "@/app/api/users/route";
import { GET as getUser, PATCH as patchUser } from "@/app/api/users/[id]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as reconcile } from "@/app/api/brokers/accounts/[id]/reconcile/route";
import { GET as getAccount } from "@/app/api/brokers/accounts/[id]/route";
import { PATCH as patchPortfolio } from "@/app/api/portfolios/[id]/route";

let w: ApiWorld;
let compliance: string;
let admin: string;
let pm: string;
let ops: string;
beforeAll(async () => {
  w = await setupApiWorld();
  compliance = await loginAs(w.users.compliance.email);
  admin = await loginAs(w.users.admin.email);
  pm = await loginAs(w.users.pm.email);
  ops = await loginAs(w.users.ops.email);
});

describe("GET /api/audit (compliance)", () => {
  it("lists login events and supports AuditFilter params", async () => {
    const all = await call(listAudit, "GET", "/api/audit", { cookie: compliance });
    expect(all.status).toBe(200);
    expectPaged(all.data);
    expect(all.data.total).toBeGreaterThanOrEqual(4); // the four logins in beforeAll
    const actions = new Set(all.data.items.map((e) => (e as AuditEvent).action));
    expect(actions.has("auth.login")).toBe(true);

    const byAction = await call(listAudit, "GET", "/api/audit?action=auth.login", { cookie: compliance });
    expectPaged(byAction.data);
    for (const e of byAction.data.items) expect((e as AuditEvent).action).toBe("auth.login");

    const byActor = await call(listAudit, "GET", `/api/audit?actorId=${w.users.pm.id}`, { cookie: compliance });
    expectPaged(byActor.data);
    expect(byActor.data.total).toBeGreaterThanOrEqual(1);
    for (const e of byActor.data.items) expect((e as AuditEvent).actor.id).toBe(w.users.pm.id);

    const bad = await call(listAudit, "GET", "/api/audit?action=not.an.action", { cookie: compliance });
    expect(bad.status).toBe(400);
  });

  it("records an order.created event for an order submitted through the API", async () => {
    const order = await call<{ id: string }>(createOrder, "POST", "/api/orders", {
      cookie: pm,
      body: { portfolioId: w.portfolio.id, instrumentId: w.instruments.aapl.id, side: "BUY", quantity: 3, rationale: "audit test" },
    });
    expect(order.status).toBe(200);
    const events = await call(listAudit, "GET", `/api/audit?targetType=Order&targetId=${order.data.id}`, { cookie: compliance });
    expectPaged(events.data);
    expect(events.data.total).toBeGreaterThanOrEqual(1);
    const byPortfolio = await call(listAudit, "GET", `/api/audit?portfolioId=${w.portfolio.id}`, { cookie: compliance });
    expectPaged(byPortfolio.data);
    expect(byPortfolio.data.items.map((e) => (e as AuditEvent).targetId)).toContain(order.data.id);
  });
});

describe("users (users:manage)", () => {
  it("admin creates and updates a user; the new user can log in", async () => {
    const created = await call<User>(createUser, "POST", "/api/users", {
      cookie: admin,
      body: { email: "newbie@example.test", name: "Nina Newbie", title: "Junior Trader", roles: ["trader"], deskIds: [w.desk.id] },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    expect(created.data.id).toMatch(/^usr_/);
    expect(created.data.status).toBe("active");

    const fetched = await call<User>(getUser, "GET", `/api/users/${created.data.id}`, { cookie: pm, params: { id: created.data.id } });
    expect(fetched.status).toBe(200);
    expect(fetched.data.email).toBe("newbie@example.test");

    const updated = await call<User>(patchUser, "PATCH", `/api/users/${created.data.id}`, {
      cookie: admin,
      params: { id: created.data.id },
      body: { title: "Trader", roles: ["trader", "analyst"] },
    });
    expect(updated.status).toBe(200);
    expect(updated.data.roles).toEqual(["trader", "analyst"]);

    const cookie = await loginAs("newbie@example.test");
    expect(cookie).toContain("ap_session=");

    const suspended = await call<User>(patchUser, "PATCH", `/api/users/${created.data.id}`, {
      cookie: admin,
      params: { id: created.data.id },
      body: { status: "suspended" },
    });
    expect(suspended.status).toBe(200);
    await expect(loginAs("newbie@example.test")).rejects.toThrow(/401/);
  });

  it("rejects duplicate emails and invalid roles", async () => {
    const dup = await call(createUser, "POST", "/api/users", {
      cookie: admin,
      body: { email: w.users.pm.email, name: "Dup", title: "x", roles: ["analyst"] },
    });
    expect([400, 409]).toContain(dup.status);
    const bad = await call(createUser, "POST", "/api/users", { cookie: admin, body: { email: "x@example.test", name: "X", title: "x", roles: ["king"] } });
    expect(bad.status).toBe(400);
  });

  it("GET /api/users/[id] 404 for unknown", async () => {
    const r = await call(getUser, "GET", "/api/users/usr_nope", { cookie: admin, params: { id: "usr_nope" } });
    expect(r.status).toBe(404);
  });
});

describe("broker accounts & portfolio status (manage permissions)", () => {
  it("ops reconciles an account", async () => {
    const r = await call<{ id: string; lastHeartbeatAt: string | null }>(reconcile, "POST", `/api/brokers/accounts/${w.accounts.ibkr.id}/reconcile`, {
      cookie: ops,
      params: { id: w.accounts.ibkr.id },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.id).toBe(w.accounts.ibkr.id);
    const denied = await call(reconcile, "POST", `/api/brokers/accounts/${w.accounts.ibkr.id}/reconcile`, { cookie: pm, params: { id: w.accounts.ibkr.id } });
    expect(denied.status).toBe(403);
    const fetched = await call<{ id: string }>(getAccount, "GET", `/api/brokers/accounts/${w.accounts.ibkr.id}`, { cookie: pm, params: { id: w.accounts.ibkr.id } });
    expect(fetched.status).toBe(200);
  });

  it("pm freezes and reactivates a portfolio", async () => {
    const frozen = await call<{ status: string }>(patchPortfolio, "PATCH", `/api/portfolios/${w.portfolio.id}`, {
      cookie: pm,
      params: { id: w.portfolio.id },
      body: { status: "frozen" },
    });
    expect(frozen.status, JSON.stringify(frozen.json)).toBe(200);
    expect(frozen.data.status).toBe("frozen");
    const back = await call<{ status: string }>(patchPortfolio, "PATCH", `/api/portfolios/${w.portfolio.id}`, {
      cookie: pm,
      params: { id: w.portfolio.id },
      body: { status: "active" },
    });
    expect(back.data.status).toBe("active");
    const denied = await call(patchPortfolio, "PATCH", `/api/portfolios/${w.portfolio.id}`, { cookie: ops, params: { id: w.portfolio.id }, body: { status: "frozen" } });
    expect(denied.status).toBe(403);
  });
});
