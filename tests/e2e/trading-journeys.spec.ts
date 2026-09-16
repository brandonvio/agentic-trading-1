import { test, expect } from "@playwright/test";
import { login, expectRendered } from "./helpers";

/** Every terminal route a signed-in admin should be able to open. */
const ROUTES = [
  "/dashboard",
  "/portfolios",
  "/positions",
  "/orders",
  "/signals",
  "/agents",
  "/strategies",
  "/risk",
  "/approvals",
  "/market",
  "/brokers",
  "/audit",
  "/admin/users",
];

test.describe("terminal routes render", () => {
  test("an admin can open every section without an error boundary", async ({ page }) => {
    const failures: string[] = [];
    await login(page, "admin");

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      const broken = await page.getByText(/build error|application error|unhandled runtime error|something went wrong/i).count();
      const hasMain = await page.locator("main").count();
      if (broken > 0 || hasMain === 0) failures.push(route);
    }

    expect(failures, `routes that failed to render: ${failures.join(", ")}`).toEqual([]);
  });
});

test.describe("portfolio and position journeys", () => {
  test("a PM drills from the portfolio list into a portfolio", async ({ page }) => {
    await login(page, "pm");
    await page.goto("/portfolios");
    await expectRendered(page);

    const firstLink = page.locator("main a[href^='/portfolios/']").first();
    await expect(firstLink).toBeVisible({ timeout: 20_000 });
    await firstLink.click();
    await page.waitForURL(/\/portfolios\/pf_/);
    await expectRendered(page);
    // NAV is the headline figure on a portfolio page.
    await expect(page.getByText(/NAV/i).first()).toBeVisible();
  });

  test("positions list shows the seeded book", async ({ page }) => {
    await login(page, "trader");
    await page.goto("/positions");
    await expectRendered(page);
    await expect(page.locator("main table tbody tr").first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("order journeys", () => {
  test("orders list renders and a row opens the order detail", async ({ page }) => {
    await login(page, "trader");
    await page.goto("/orders");
    await expectRendered(page);

    const firstLink = page.locator("main a[href^='/orders/']").first();
    await expect(firstLink).toBeVisible({ timeout: 20_000 });
    await firstLink.click();
    await page.waitForURL(/\/orders\/ord_/);
    await expectRendered(page);
    // The detail page must show the pre-trade risk evidence.
    await expect(page.getByText(/risk check/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("a trader can submit an order through the API and it is booked", async ({ page }) => {
    await login(page, "trader");

    const result = await page.evaluate(async () => {
      const pf = await (await fetch("/api/portfolios?limit=1")).json();
      const portfolio = pf.data.items[0];
      const ins = await (await fetch(`/api/instruments?assetClass=${portfolio.mandate.assetClasses[0]}&limit=1`)).json();
      const instrument = ins.data.items[0];
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          instrumentId: instrument.id,
          side: "BUY",
          type: "MARKET",
          quantity: 1,
          rationale: "e2e smoke test",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    const order = result.body.data;
    // Any terminal-or-live state is acceptable; being silently dropped is not.
    expect(["FILLED", "PARTIALLY_FILLED", "ACKNOWLEDGED", "PENDING_APPROVAL", "RISK_REJECTED"]).toContain(order.status);
    expect(order.riskChecks.length).toBeGreaterThan(0);
  });

  test("an oversized order is stopped by pre-trade risk with reasons", async ({ page }) => {
    await login(page, "trader");

    const order = await page.evaluate(async () => {
      const pf = await (await fetch("/api/portfolios?limit=1")).json();
      const portfolio = pf.data.items[0];
      const ins = await (await fetch(`/api/instruments?assetClass=${portfolio.mandate.assetClasses[0]}&limit=1`)).json();
      const instrument = ins.data.items[0];
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          instrumentId: instrument.id,
          side: "BUY",
          type: "MARKET",
          quantity: 10_000_000,
          rationale: "e2e oversized",
        }),
      });
      return (await res.json()).data;
    });

    expect(order.status).toBe("RISK_REJECTED");
    expect(order.rejectionReason).toBeTruthy();
    expect(order.riskChecks.some((c: { passed: boolean }) => !c.passed)).toBe(true);
  });
});

test.describe("risk and approvals", () => {
  test("the risk page shows limits and breaches to a risk manager", async ({ page }) => {
    await login(page, "risk");
    await page.goto("/risk");
    await expectRendered(page);
    await expect(page.getByText(/limit|breach/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("the approvals queue lists pending requests", async ({ page }) => {
    await login(page, "cio");
    await page.goto("/approvals");
    await expectRendered(page);
    const count = await page.evaluate(async () => (await (await fetch("/api/approvals/pending-count")).json()).data.count);
    expect(count).toBeGreaterThan(0);
  });

  test("four-eyes blocks a requester from deciding their own approval", async ({ page }) => {
    await login(page, "admin");
    const outcome = await page.evaluate(async () => {
      const list = await (await fetch("/api/approvals?status=pending&limit=20")).json();
      const mine = list.data.items.find(
        (a: { requestedBy: { kind: string; id: string } }) => a.requestedBy.kind === "user",
      );
      if (!mine) return { skipped: true as const };
      const me = await (await fetch("/api/me")).json();
      const res = await fetch(`/api/approvals/${mine.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", note: "e2e" }),
      });
      return { skipped: false as const, status: res.status, sameUser: mine.requestedBy.id === me.data.principal.userId };
    });

    if (outcome.skipped) test.skip(true, "no user-requested pending approval in the seed");
    else if (outcome.sameUser) expect(outcome.status).toBe(403);
    else expect([200, 409]).toContain(outcome.status);
  });
});
