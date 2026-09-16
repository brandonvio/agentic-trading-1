import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  ROLE_CATALOG,
  permissionsForRoles,
  principalFromUser,
  hasPermission,
  hasAnyPermission,
  canAccessDesk,
} from "@/lib/auth/permissions";
import { PERMISSIONS, ROLE_KEYS, User } from "@/lib/domain/auth";

const baseUser = (over: Partial<User> = {}): User =>
  User.parse({
    id: "usr_1",
    email: "t@agenticprop.io",
    name: "Test",
    title: "Trader",
    status: "active",
    roles: ["trader"],
    deskIds: ["desk_1"],
    avatarColor: "#000",
    lastLoginAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  });

describe("RBAC matrix", () => {
  it("defines every role and only known permissions", () => {
    for (const role of ROLE_KEYS) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
    }
    expect(ROLE_CATALOG.map((r) => r.key).sort()).toEqual([...ROLE_KEYS].sort());
  });

  it("global_admin holds every permission", () => {
    expect(new Set(ROLE_PERMISSIONS.global_admin).size).toBe(PERMISSIONS.length);
  });

  it("enforces separation of duties", () => {
    expect(ROLE_PERMISSIONS.trader).not.toContain("orders:approve");
    expect(ROLE_PERMISSIONS.trader).not.toContain("risk:limits:write");
    expect(ROLE_PERMISSIONS.quant_researcher).not.toContain("orders:create");
    expect(ROLE_PERMISSIONS.compliance_officer).not.toContain("orders:create");
    expect(ROLE_PERMISSIONS.compliance_officer).toContain("agents:kill");
    expect(ROLE_PERMISSIONS.risk_manager).toContain("orders:override-risk");
    expect(ROLE_PERMISSIONS.analyst.every((p) => p.endsWith(":read"))).toBe(true);
    expect(ROLE_PERMISSIONS.operations).toContain("brokers:manage");
    expect(ROLE_PERMISSIONS.operations).not.toContain("orders:create");
  });

  it("unions permissions across roles", () => {
    const perms = permissionsForRoles(["trader", "quant_researcher"]);
    expect(perms).toContain("orders:create");
    expect(perms).toContain("research:backtest");
    expect(new Set(perms).size).toBe(perms.length);
  });

  it("builds principals with desk visibility semantics", () => {
    const trader = principalFromUser(baseUser());
    expect(trader.allDesks).toBe(false);
    expect(hasPermission(trader, "orders:create")).toBe(true);
    expect(hasPermission(trader, "users:manage")).toBe(false);
    expect(hasAnyPermission(trader, ["users:manage", "orders:read"])).toBe(true);
    expect(canAccessDesk(trader, "desk_1")).toBe(true);
    expect(canAccessDesk(trader, "desk_2")).toBe(false);
    expect(canAccessDesk(trader, null)).toBe(false);

    const risk = principalFromUser(baseUser({ roles: ["risk_manager"], deskIds: [] }));
    expect(risk.allDesks).toBe(true);
    expect(canAccessDesk(risk, "desk_99")).toBe(true);
    expect(canAccessDesk(risk, null)).toBe(true);
  });
});
