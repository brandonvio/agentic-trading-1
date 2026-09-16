// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { principalFromUser } from "@/lib/auth/permissions";
import type { Principal, RoleKey } from "@/lib/domain/auth";
import { NAV_ITEMS, isNavActive, visibleNavItems, type NavItem } from "@/lib/ui/nav";
import { makeUser } from "@/tests/fixtures/entities";
import { groupNavItems } from "@/components/shell/sidebar";

function principalWithRoles(...roles: RoleKey[]): Principal {
  return principalFromUser(makeUser({ roles }));
}

const labels = (items: NavItem[]) => items.map((item) => item.label);

describe("visibleNavItems", () => {
  it("shows only permission-free items when there is no principal", () => {
    expect(labels(visibleNavItems(null))).toEqual(["Dashboard"]);
    expect(labels(visibleNavItems(undefined))).toEqual(["Dashboard"]);
  });

  it("gives a global admin every item", () => {
    expect(visibleNavItems(principalWithRoles("global_admin"))).toHaveLength(NAV_ITEMS.length);
  });

  it("hides admin and audit routes from a trader", () => {
    const visible = labels(visibleNavItems(principalWithRoles("trader")));
    expect(visible).toContain("Orders");
    expect(visible).toContain("Positions");
    expect(visible).not.toContain("Users");
    expect(visible).not.toContain("Audit");
  });

  it("gives compliance the audit trail and approvals queue", () => {
    const visible = labels(visibleNavItems(principalWithRoles("compliance_officer")));
    expect(visible).toContain("Audit");
    expect(visible).toContain("Approvals");
  });

  it("hides the approvals, audit and broker routes from a quant researcher", () => {
    const visible = labels(visibleNavItems(principalWithRoles("quant_researcher")));
    expect(visible).toContain("Strategies");
    expect(visible).not.toContain("Approvals");
    expect(visible).not.toContain("Audit");
    expect(visible).not.toContain("Brokers");
  });

  it("unions permissions across several roles", () => {
    const visible = labels(visibleNavItems(principalWithRoles("trader", "compliance_officer")));
    expect(visible).toContain("Orders");
    expect(visible).toContain("Audit");
  });

  it("preserves the declared order and filters a custom list", () => {
    const custom: NavItem[] = [NAV_ITEMS[0]!, NAV_ITEMS[NAV_ITEMS.length - 1]!];
    expect(labels(visibleNavItems(principalWithRoles("analyst"), custom))).toEqual(["Dashboard"]);
  });
});

describe("isNavActive", () => {
  it("matches the exact route and nested routes only", () => {
    expect(isNavActive("/orders", "/orders")).toBe(true);
    expect(isNavActive("/orders/ord_1", "/orders")).toBe(true);
    expect(isNavActive("/orders-archive", "/orders")).toBe(false);
    expect(isNavActive("/positions", "/orders")).toBe(false);
  });
});

describe("groupNavItems", () => {
  it("starts a new group at every item carrying a section", () => {
    const groups = groupNavItems(visibleNavItems(principalWithRoles("global_admin")));
    expect(groups[0]!.section).toBeNull();
    expect(groups.map((group) => group.section)).toEqual([null, "Intelligence", "Control", "Infrastructure", "Admin"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(NAV_ITEMS.length);
  });

  it("returns no groups for an empty list", () => {
    expect(groupNavItems([])).toEqual([]);
  });
});
