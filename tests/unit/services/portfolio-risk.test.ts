import { describe, it, expect, beforeEach } from "vitest";
import { createHarness, type Harness } from "./harness";
import { ForbiddenError } from "@/lib/core/errors";
import { buildPosition, buildRiskLimit } from "@/tests/fixtures/entities";

let h: Harness;

beforeEach(async () => {
  h = await createHarness({ broker: { price: 200, commission: 5 } });
});

async function openPosition(over: Parameters<typeof buildPosition>[0] = {}) {
  return h.repos.positions.create(
    buildPosition({
      portfolioId: h.portfolio.id,
      brokerAccountId: h.accounts.ibkr.id,
      instrumentId: h.instruments.aapl.id,
      symbol: "AAPL",
      assetClass: "equity",
      quantity: 10_000,
      averagePrice: 180,
      markPrice: 200,
      marketValue: 2_000_000,
      unrealizedPnl: 200_000,
      realizedPnl: 0,
      closedAt: null,
      ...over,
    }),
  );
}

describe("PortfolioService.snapshot", () => {
  it("derives NAV, exposure and leverage from open positions", async () => {
    await openPosition();
    const snap = await h.services.portfolios.snapshot(h.principal("pm"), h.portfolio.id);

    expect(snap.cash).toBe(100_000_000);
    expect(snap.nav).toBe(102_000_000);
    expect(snap.grossExposure).toBe(2_000_000);
    expect(snap.netExposure).toBe(2_000_000);
    expect(snap.grossLeverage).toBeCloseTo(2_000_000 / 102_000_000, 6);
    expect(snap.unrealizedPnl).toBe(200_000);
    expect(snap.positionCount).toBe(1);
    expect(snap.exposureByAssetClass.equity).toBe(2_000_000);
    expect(snap.topConcentration?.symbol).toBe("AAPL");
  });

  it("treats a short as negative net but positive gross exposure", async () => {
    await openPosition({ quantity: -5_000, marketValue: -1_000_000, unrealizedPnl: -50_000 });
    const snap = await h.services.portfolios.snapshot(h.principal("pm"), h.portfolio.id);
    expect(snap.grossExposure).toBe(1_000_000);
    expect(snap.netExposure).toBe(-1_000_000);
    expect(snap.nav).toBe(99_000_000);
  });

  it("excludes closed positions from exposure but keeps their realised PnL", async () => {
    await openPosition({ id: "pos_closed", quantity: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 75_000, closedAt: "2026-09-01T12:00:00.000Z" });
    const snap = await h.services.portfolios.snapshot(h.principal("pm"), h.portfolio.id);
    expect(snap.positionCount).toBe(0);
    expect(snap.grossExposure).toBe(0);
    expect(snap.realizedPnl).toBe(75_000);
  });

  it("computes inception return from the stated starting capital", async () => {
    const snap = await h.services.portfolios.snapshot(h.principal("pm"), h.portfolio.id);
    // NAV 100M against 80M inception capital.
    expect(snap.inceptionReturnPct).toBeCloseTo(0.25, 6);
  });

  it("requires portfolios:read and desk visibility", async () => {
    await expect(h.services.portfolios.snapshot(h.principal("otherTrader"), h.portfolio.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("PortfolioService.markToMarket", () => {
  it("re-marks open positions at the current quote and updates NAV", async () => {
    await openPosition({ markPrice: 150, marketValue: 1_500_000, unrealizedPnl: -300_000 });
    h.brokers.configure((a) => (a.price = 220));

    const snap = await h.services.portfolios.markToMarket(h.principal("pm"), h.portfolio.id);
    const position = await h.repos.positions.findOpen(h.portfolio.id, h.instruments.aapl.id);

    expect(position?.markPrice).toBe(220);
    expect(position?.marketValue).toBe(2_200_000);
    // Bought at 180, marked at 220, 10,000 shares.
    expect(position?.unrealizedPnl).toBeCloseTo(400_000, 6);
    expect(snap.nav).toBe(102_200_000);
  });
});

describe("PortfolioService.firmSnapshot", () => {
  it("aggregates only the portfolios the principal can see", async () => {
    await openPosition();
    await h.repos.portfolios.create({ ...h.portfolio, id: "pf_hidden", code: "EQD-VOL", deskId: h.otherDesk.id, cash: 50_000_000 });

    const all = await h.services.portfolios.firmSnapshot(h.principal("admin"));
    expect(all.portfolioCount).toBe(2);
    expect(all.totalNav).toBe(102_000_000 + 50_000_000);

    const scoped = await h.services.portfolios.firmSnapshot(h.principal("trader"));
    expect(scoped.portfolioCount).toBe(1);
    expect(scoped.totalNav).toBe(102_000_000);
  });
});

describe("RiskService.report", () => {
  it("reports utilisation against each applicable limit", async () => {
    await openPosition();
    await h.repos.riskLimits.create(
      buildRiskLimit({
        id: "lim_gross",
        name: "Platform gross exposure",
        scope: "platform",
        scopeId: null,
        metric: "gross_exposure_pct_nav",
        threshold: 4,
        action: "block",
        enabled: true,
      }),
    );

    const report = await h.services.risk.report(h.principal("risk"), h.portfolio.id);
    expect(report.nav).toBe(102_000_000);
    const gross = report.limits.find((l) => l.limit.id === "lim_gross");
    expect(gross?.status).toBe("ok");
    expect(gross?.observed).toBeCloseTo(2_000_000 / 102_000_000, 6);
  });

  it("requires risk:read", async () => {
    await expect(h.services.risk.report(h.principal("otherTrader"), h.portfolio.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("RiskService.scanPortfolio", () => {
  it("records a breach when a limit is violated and does not duplicate it", async () => {
    await openPosition({ quantity: 400_000, marketValue: 80_000_000, unrealizedPnl: 0 });
    await h.repos.riskLimits.create(
      buildRiskLimit({
        id: "lim_conc",
        name: "Single instrument concentration",
        scope: "portfolio",
        scopeId: h.portfolio.id,
        metric: "single_instrument_pct_nav",
        threshold: 0.1,
        action: "block",
        enabled: true,
      }),
    );

    const first = await h.services.risk.scanPortfolio(h.portfolio.id, { kind: "system", id: "system", name: "system" });
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].severity).toBe("critical");

    const second = await h.services.risk.scanPortfolio(h.portfolio.id, { kind: "system", id: "system", name: "system" });
    expect(second).toHaveLength(0);
  });
});

describe("RiskService limits and breaches", () => {
  it("gates limit writes behind risk:limits:write", async () => {
    const input = {
      name: "Test limit",
      scope: "portfolio" as const,
      scopeId: h.portfolio.id,
      metric: "order_notional" as const,
      qualifier: null,
      threshold: 1_000_000,
      warnThreshold: null,
      action: "warn" as const,
      enabled: true,
    };
    await expect(h.services.risk.createLimit(h.principal("trader"), input)).rejects.toBeInstanceOf(ForbiddenError);
    const created = await h.services.risk.createLimit(h.principal("risk"), input);
    expect(created.id).toBeTruthy();
    expect(created.createdByUserId).toBe(h.users.risk.id);
  });

  it("lets a risk manager acknowledge and resolve a breach", async () => {
    await openPosition({ quantity: 400_000, marketValue: 80_000_000 });
    await h.repos.riskLimits.create(
      buildRiskLimit({ id: "lim_x", scope: "portfolio", scopeId: h.portfolio.id, metric: "single_instrument_pct_nav", threshold: 0.1, action: "block", enabled: true }),
    );
    const [breach] = await h.services.risk.scanPortfolio(h.portfolio.id, { kind: "system", id: "system", name: "system" });

    const acked = await h.services.risk.acknowledgeBreach(h.principal("risk"), breach.id);
    expect(acked.status).toBe("acknowledged");

    const resolved = await h.services.risk.resolveBreach(h.principal("risk"), breach.id, "hedged with futures");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolutionNote).toBe("hedged with futures");
    expect(resolved.resolvedByUserId).toBe(h.users.risk.id);
  });

  it("refuses breach resolution without risk:breaches:resolve", async () => {
    await openPosition({ quantity: 400_000, marketValue: 80_000_000 });
    await h.repos.riskLimits.create(
      buildRiskLimit({ id: "lim_y", scope: "portfolio", scopeId: h.portfolio.id, metric: "single_instrument_pct_nav", threshold: 0.1, action: "block", enabled: true }),
    );
    const [breach] = await h.services.risk.scanPortfolio(h.portfolio.id, { kind: "system", id: "system", name: "system" });
    await expect(h.services.risk.resolveBreach(h.principal("trader"), breach.id, "nope")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("AuditService", () => {
  it("requires audit:read and scopes to visible portfolios", async () => {
    await h.services.orders.submit(h.principal("trader"), {
      portfolioId: h.portfolio.id,
      instrumentId: h.instruments.aapl.id,
      side: "BUY",
      type: "MARKET",
      quantity: 100,
      timeInForce: "DAY",
      rationale: "t",
      origin: "manual",
    });

    await expect(h.services.audit.list(h.principal("trader"), {}, { limit: 50, offset: 0 })).rejects.toBeInstanceOf(ForbiddenError);
    const compliance = await h.services.audit.list(h.principal("compliance"), {}, { limit: 50, offset: 0 });
    expect(compliance.total).toBeGreaterThan(0);
  });
});
