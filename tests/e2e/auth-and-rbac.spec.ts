import { test, expect } from "@playwright/test";
import { login, expectRendered, navLabels, USERS } from "./helpers";

test.describe("authentication", () => {
  test("unauthenticated visitors are redirected to the login screen", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in as/i })).toBeVisible();
  });

  test("the login screen lists seeded identities", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Ava Sterling/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Marcus Okonkwo/ })).toBeVisible();
    await expect(page.getByText(/mock mode/i)).toBeVisible();
  });

  test("signing in as a candidate card lands on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Ava Sterling/ }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(USERS.admin.name)).toBeVisible();
  });

  test("an unknown email is rejected with an error, not a crash", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("nobody@agenticprop.io");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/no active user matches that email/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("the root path resolves into the terminal", async ({ page }) => {
    await login(page, "trader");
    await page.goto("/");
    await page.waitForURL(/\/dashboard/);
    await expectRendered(page);
  });
});

test.describe("role-based navigation", () => {
  test("an admin sees every section including Users", async ({ page }) => {
    await login(page, "admin");
    const labels = await navLabels(page);
    for (const expected of ["Dashboard", "Portfolios", "Orders", "Agents", "Risk", "Approvals", "Audit", "Users"]) {
      expect(labels, `admin nav should contain ${expected}`).toContain(expected);
    }
  });

  test("a trader has no Audit or Users section", async ({ page }) => {
    await login(page, "trader");
    const labels = await navLabels(page);
    expect(labels).toContain("Orders");
    expect(labels).toContain("Positions");
    expect(labels).not.toContain("Audit");
    expect(labels).not.toContain("Users");
  });

  test("a compliance officer sees Audit and Approvals", async ({ page }) => {
    await login(page, "compliance");
    const labels = await navLabels(page);
    expect(labels).toContain("Audit");
    expect(labels).toContain("Approvals");
  });

  test("an analyst is read-only and cannot reach the audit log", async ({ page }) => {
    await login(page, "analyst");
    const labels = await navLabels(page);
    expect(labels).not.toContain("Audit");
    expect(labels).not.toContain("Users");

    // Direct navigation is refused by the service, not by hiding the link.
    await page.goto("/audit");
    await expect(page.getByText(/not permitted|forbidden|insufficient/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("API authorization", () => {
  test("an analyst cannot create an order", async ({ page }) => {
    await login(page, "analyst");
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId: "pf_seed0001", instrumentId: "ins_seed0001", side: "BUY", type: "MARKET", quantity: 1 }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });

  test("a trader cannot write risk limits", async ({ page }) => {
    await login(page, "trader");
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/risk/limits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", scope: "platform", scopeId: null, metric: "order_notional", threshold: 1, action: "warn", enabled: true }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });

  test("a request without a session is unauthorized", async ({ page, context }) => {
    await login(page, "trader");
    await context.clearCookies();
    const status = await page.evaluate(async () => (await fetch("/api/orders")).status);
    expect(status).toBe(401);
  });
});
