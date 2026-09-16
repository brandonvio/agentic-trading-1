import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth/session";
import { setupApiWorld, call, loginAs, type ApiWorld } from "./helpers";
import { GET as health } from "@/app/api/health/route";
import { GET as candidates } from "@/app/api/auth/candidates/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/me/route";
import { GET as listOrders } from "@/app/api/orders/route";

let w: ApiWorld;
beforeAll(async () => {
  w = await setupApiWorld();
});

describe("GET /api/health", () => {
  it("is public and reports persistence + llm provider", async () => {
    const r = await call<{ status: string; time: string; persistence: string; llmProvider: string }>(health, "GET", "/api/health");
    expect(r.status).toBe(200);
    expect(r.data.status).toBe("ok");
    expect(r.data.persistence).toMatch(/memory|neo4j/);
    expect(typeof r.data.llmProvider).toBe("string");
    expect(new Date(r.data.time).getTime()).toBeGreaterThan(0);
  });
});

describe("GET /api/auth/candidates", () => {
  it("lists active users without a session", async () => {
    const r = await call<Array<{ id: string; email: string; roles: string[] }>>(candidates, "GET", "/api/auth/candidates");
    expect(r.status).toBe(200);
    expect(r.data.map((u) => u.email)).toContain(w.users.pm.email);
    expect(r.data.find((u) => u.email === w.users.admin.email)?.roles).toEqual(["global_admin"]);
    // Never leaks fields beyond the candidate projection.
    expect(Object.keys(r.data[0]).sort()).toEqual(["avatarColor", "email", "id", "name", "roles", "title"]);
  });
});

describe("POST /api/auth/login", () => {
  it("sets a signed session cookie and returns the user", async () => {
    const req = new NextRequest("http://localhost:3001/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      body: JSON.stringify({ email: w.users.pm.email }),
    });
    const res = await login(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: { id: string; email: string }; expiresAt: number } };
    expect(body.data.user.id).toBe(w.users.pm.id);
    expect(body.data.expiresAt).toBeGreaterThan(Date.now());

    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
    const payload = decodeSession(cookie!.value);
    expect(payload?.userId).toBe(w.users.pm.id);
    expect(payload?.expiresAt).toBe(body.data.expiresAt);
  });

  it("rejects an unknown email with 401", async () => {
    const r = await call(login, "POST", "/api/auth/login", { body: { email: "nobody@example.test" } });
    expect(r.status).toBe(401);
    expect(r.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed body with 400 + details", async () => {
    const r = await call(login, "POST", "/api/auth/login", { body: { email: "not-an-email" } });
    expect(r.status).toBe(400);
    expect(r.error?.code).toBe("VALIDATION_ERROR");
    expect((r.error?.details as { fieldErrors: Record<string, string[]> }).fieldErrors.email).toBeTruthy();
  });
});

describe("GET /api/me", () => {
  it("returns the user profile and resolved principal", async () => {
    const cookie = await loginAs(w.users.trader.email);
    const r = await call<{ id: string; email: string; principal: { userId: string; permissions: string[]; deskIds: string[]; allDesks: boolean } }>(
      me,
      "GET",
      "/api/me",
      { cookie },
    );
    expect(r.status).toBe(200);
    expect(r.data.id).toBe(w.users.trader.id);
    expect(r.data.email).toBe(w.users.trader.email);
    expect(r.data.principal.userId).toBe(w.users.trader.id);
    expect(r.data.principal.permissions).toContain("orders:create");
    expect(r.data.principal.permissions).not.toContain("approvals:decide");
    expect(r.data.principal.deskIds).toEqual([w.desk.id]);
    expect(r.data.principal.allDesks).toBe(false);
  });

  it("accepts a bearer token as well as the cookie", async () => {
    const cookie = await loginAs(w.users.trader.email);
    const token = cookie.split("=")[1];
    const r = await call<{ id: string }>(me, "GET", "/api/me", { headers: { authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200);
    expect(r.data.id).toBe(w.users.trader.id);
  });
});

describe("authentication gate", () => {
  it("returns 401 without a cookie", async () => {
    const r = await call(listOrders, "GET", "/api/orders");
    expect(r.status).toBe(401);
    expect(r.error?.code).toBe("UNAUTHORIZED");
    expect(r.json).not.toHaveProperty("data");
  });

  it("returns 401 for a tampered cookie", async () => {
    const cookie = await loginAs(w.users.trader.email);
    const r = await call(me, "GET", "/api/me", { cookie: `${cookie}x` });
    expect(r.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const cookie = await loginAs(w.users.trader.email);
    const r = await call<{ ok: boolean }>(logout, "POST", "/api/auth/logout", { cookie });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    const setCookie = r.res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("requires a session", async () => {
    const r = await call(logout, "POST", "/api/auth/logout");
    expect(r.status).toBe(401);
  });
});
