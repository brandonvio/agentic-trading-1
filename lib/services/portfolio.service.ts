import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { AssetClass } from "@/lib/domain/instrument";
import type { Portfolio, Position, PortfolioSnapshot } from "@/lib/domain/portfolio";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { BrokerRegistry } from "@/lib/brokers/types";
import type { Clock } from "@/lib/core/clock";
import type { Logger } from "@/lib/core/logger";
import { NotFoundError } from "@/lib/core/errors";
import type { PortfolioService, FirmSnapshot, AuditService } from "./interfaces";
import { ALL_ROWS, PortfolioScope, actorOf, requirePermission, visibleDeskIds } from "./authz";
import { computeSnapshot, emptyExposureByAssetClass, remark } from "./helpers/portfolio-math";
import { startOfUtcDayIso } from "./helpers/time";

type PortfolioRepos = Pick<Repositories, "portfolios" | "positions" | "instruments" | "desks">;

/** Portfolio visibility, analytics (NAV/PnL/exposure) and mark-to-market. */
export class PortfolioServiceImpl implements PortfolioService {
  constructor(
    private readonly repos: PortfolioRepos,
    private readonly brokers: BrokerRegistry,
    private readonly scope: PortfolioScope,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Requires portfolios:read and desk visibility. */
  async get(principal: Principal, id: string): Promise<Portfolio> {
    requirePermission(principal, "portfolios:read");
    return this.scope.load(principal, id);
  }

  /** Requires portfolios:read. Non-global principals only see portfolios on their desks. */
  async list(principal: Principal, filter: { deskId?: string; status?: Portfolio["status"] }, page: PageQuery): Promise<Paged<Portfolio>> {
    requirePermission(principal, "portfolios:read");
    const desks = visibleDeskIds(principal);
    if (filter.deskId && desks !== "all" && !desks.includes(filter.deskId)) return { items: [], total: 0, limit: page.limit, offset: page.offset };
    return this.repos.portfolios.list({ deskId: filter.deskId, deskIds: desks === "all" ? undefined : desks, status: filter.status }, page);
  }

  async visiblePortfolioIds(principal: Principal): Promise<string[] | "all"> {
    return this.scope.visibleIds(principal);
  }

  /** Requires portfolios:read. Derived from stored position marks (see helpers/portfolio-math.ts for the dayPnl heuristic). */
  async snapshot(principal: Principal, id: string): Promise<PortfolioSnapshot> {
    requirePermission(principal, "portfolios:read");
    const portfolio = await this.scope.load(principal, id);
    return this.snapshotOf(portfolio);
  }

  /** Requires portfolios:read. Aggregates snapshots across every visible portfolio and groups NAV/PnL by desk. */
  async firmSnapshot(principal: Principal): Promise<FirmSnapshot> {
    requirePermission(principal, "portfolios:read");
    const portfolios = await this.scope.visiblePortfolios(principal);
    const snapshots: PortfolioSnapshot[] = [];
    for (const p of portfolios) snapshots.push(await this.snapshotOf(p));
    const exposureByAssetClass = emptyExposureByAssetClass();
    const byDesk = new Map<string, { nav: number; dayPnl: number }>();
    let totalNav = 0;
    let totalCash = 0;
    let dayPnl = 0;
    let unrealizedPnl = 0;
    let grossExposure = 0;
    let openPositionCount = 0;
    portfolios.forEach((p, i) => {
      const s = snapshots[i];
      totalNav += s.nav;
      totalCash += s.cash;
      dayPnl += s.dayPnl;
      unrealizedPnl += s.unrealizedPnl;
      grossExposure += s.grossExposure;
      openPositionCount += s.positionCount;
      for (const ac of Object.keys(s.exposureByAssetClass) as AssetClass[]) exposureByAssetClass[ac] += s.exposureByAssetClass[ac];
      const d = byDesk.get(p.deskId) ?? { nav: 0, dayPnl: 0 };
      byDesk.set(p.deskId, { nav: d.nav + s.nav, dayPnl: d.dayPnl + s.dayPnl });
    });
    const desks = await this.repos.desks.listByIds([...byDesk.keys()]);
    const deskName = new Map(desks.map((d) => [d.id, d.name]));
    return {
      asOf: this.clock.nowIso(),
      totalNav,
      totalCash,
      dayPnl,
      unrealizedPnl,
      grossExposure,
      grossLeverage: totalNav > 0 ? grossExposure / totalNav : 0,
      portfolioCount: portfolios.length,
      openPositionCount,
      exposureByAssetClass,
      exposureByDesk: [...byDesk.entries()].map(([deskId, v]) => ({ deskId, deskName: deskName.get(deskId) ?? deskId, nav: v.nav, dayPnl: v.dayPnl })),
      portfolios: snapshots,
    };
  }

  /** Requires positions:read. Scoped to visible portfolios. */
  async listPositions(principal: Principal, filter: { portfolioId?: string; assetClass?: AssetClass; strategyId?: string; open?: boolean }, page: PageQuery): Promise<Paged<Position>> {
    requirePermission(principal, "positions:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.positions.list({ ...filter, ...scoped }, page);
  }

  /** Requires positions:read and portfolio visibility. */
  async getPosition(principal: Principal, id: string): Promise<Position> {
    requirePermission(principal, "positions:read");
    const position = await this.repos.positions.findById(id);
    if (!position) throw new NotFoundError("Position", id);
    await this.scope.assertVisibleId(principal, position.portfolioId);
    return position;
  }

  /** Requires positions:read. Re-marks every open position with a fresh broker quote and recomputes NAV. */
  async markToMarket(principal: Principal, portfolioId: string): Promise<PortfolioSnapshot> {
    requirePermission(principal, "positions:read");
    const portfolio = await this.scope.load(principal, portfolioId);
    const open = (await this.repos.positions.list({ portfolioId, open: true }, ALL_ROWS)).items;
    const instruments = await this.repos.instruments.listByIds(open.map((p) => p.instrumentId));
    const byId = new Map(instruments.map((i) => [i.id, i]));
    const now = this.clock.nowIso();
    let marketValue = 0;
    for (const position of open) {
      const instrument = byId.get(position.instrumentId);
      if (!instrument) {
        this.logger.warn("Position references unknown instrument; skipping mark", { positionId: position.id });
        marketValue += position.marketValue;
        continue;
      }
      const quote = await this.brokers.get(instrument.broker).getQuote(instrument);
      const marks = remark(position, quote.mid, instrument.multiplier);
      await this.repos.positions.update(position.id, { ...marks, updatedAt: now });
      marketValue += marks.marketValue;
    }
    const updated = await this.repos.portfolios.update(portfolioId, { nav: portfolio.cash + marketValue, navAsOf: now, updatedAt: now });
    return this.snapshotOf(updated);
  }

  /** Requires portfolios:manage. Changes lifecycle status (active/frozen/liquidating/closed). */
  async updateStatus(principal: Principal, id: string, status: Portfolio["status"]): Promise<Portfolio> {
    requirePermission(principal, "portfolios:manage");
    const portfolio = await this.scope.load(principal, id);
    const updated = await this.repos.portfolios.update(id, { status, updatedAt: this.clock.nowIso() });
    // AuditAction has no portfolio status action yet (contract change proposed); log until one exists.
    this.logger.info("Portfolio status changed", { portfolioId: id, from: portfolio.status, to: status, by: actorOf(principal).id });
    return updated;
  }

  private async snapshotOf(portfolio: Portfolio): Promise<PortfolioSnapshot> {
    const positions = (await this.repos.positions.list({ portfolioId: portfolio.id }, ALL_ROWS)).items;
    const now = this.clock.now();
    return computeSnapshot({ portfolio, positions, asOf: now.toISOString(), startOfDay: startOfUtcDayIso(now) });
  }
}
