import { test, expect } from "@playwright/test";
import { login, expectRendered } from "./helpers";

test.describe("agent console", () => {
  test("the agents page lists the seeded roster with autonomy levels", async ({ page }) => {
    await login(page, "pm");
    await page.goto("/agents");
    await expectRendered(page);
    await expect(page.getByText(/autonomous|supervised|advisory/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("a run page shows the full reasoning trace", async ({ page }) => {
    await login(page, "pm");

    const runId = await page.evaluate(async () => {
      const res = await (await fetch("/api/agent-runs?limit=20")).json();
      const withSteps = res.data.items.find((r: { stepCount: number }) => r.stepCount > 0);
      return withSteps?.id ?? null;
    });
    expect(runId, "seed should contain at least one run with steps").toBeTruthy();

    await page.goto(`/agents/runs/${runId}`);
    await expectRendered(page);
    // The trace is the point of the page: tool calls must be visible.
    await expect(page.getByText(/tool|thought|step/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("agent execution", () => {
  test("running an agent produces a persisted, auditable run", async ({ page }) => {
    await login(page, "pm");

    const run = await page.evaluate(async () => {
      const list = await (await fetch("/api/agents?limit=50")).json();
      const runnable = list.data.items.find((a: { status: string }) => a.status === "idle");
      if (!runnable) return null;
      const res = await fetch(`/api/agents/${runnable.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(run, "seed should contain an idle agent").toBeTruthy();
    expect(run!.status).toBe(200);

    const data = run!.body.data;
    expect(["succeeded", "budget_exhausted"]).toContain(data.status);
    expect(data.stepCount).toBeGreaterThan(0);
    expect(data.costUsd).toBeGreaterThan(0);

    // The trace must be retrievable afterwards, in order.
    const steps = await page.evaluate(async (id: string) => (await (await fetch(`/api/agent-runs/${id}/steps`)).json()).data, data.id as string);
    expect(steps.length).toBe(data.stepCount);
    const indexes = steps.map((s: { index: number }) => s.index);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  test("an advisory agent may not place orders", async ({ page }) => {
    await login(page, "pm");

    const outcome = await page.evaluate(async () => {
      const list = await (await fetch("/api/agents?limit=50")).json();
      const advisory = list.data.items.find((a: { autonomy: string; status: string }) => a.autonomy === "advisory" && a.status === "idle");
      if (!advisory) return { skipped: true as const };
      const res = await fetch(`/api/agents/${advisory.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: "Place a large order immediately." }),
      });
      const body = await res.json();
      return { skipped: false as const, orderIds: body.data.orderIds as string[] };
    });

    if (outcome.skipped) test.skip(true, "no idle advisory agent in the seed");
    else expect(outcome.orderIds).toEqual([]);
  });

  test("a portfolio cycle chains several agents together", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "pm");

    const cycle = await page.evaluate(async () => {
      const pf = await (await fetch("/api/portfolios?limit=20")).json();
      const target = pf.data.items.find((p: { status: string }) => p.status === "active");
      const res = await fetch(`/api/portfolios/${target.id}/cycle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(cycle.status).toBe(200);
    const runs = cycle.body.data.runs as Array<{ agentKind: string; status: string }>;
    expect(runs.length).toBeGreaterThan(0);
    // Every stage that ran must have completed cleanly.
    for (const r of runs) expect(["succeeded", "budget_exhausted"], `${r.agentKind} ended ${r.status}`).toContain(r.status);
  });

  test("agents:run is required to trigger an agent", async ({ page }) => {
    await login(page, "analyst");
    const status = await page.evaluate(async () => {
      const list = await (await fetch("/api/agents?limit=1")).json();
      const agent = list.data.items[0];
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });
});

test.describe("signals", () => {
  test("the signals page renders the queue with conviction", async ({ page }) => {
    await login(page, "trader");
    await page.goto("/signals");
    await expectRendered(page);
    await expect(page.getByText(/conviction|LONG|SHORT/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
