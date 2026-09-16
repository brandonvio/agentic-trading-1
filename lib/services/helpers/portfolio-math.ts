/**
 * Pure portfolio analytics shared by PortfolioService and RiskService.
 *
 * Conventions
 *  - `Position.marketValue` already includes the contract multiplier and is
 *    signed (negative for shorts).
 *  - NAV = cash + Σ marketValue of open positions.
 *  - dayPnl is attributed per position:
 *      • when `previousClose` is known, the position's share of the day's move
 *        (marketValue scaled by (mark - previousClose) / mark);
 *      • otherwise, for a position opened today, its whole unrealised PnL,
 *        since it had no prior close to move from;
 *      • plus realised PnL on positions closed today.
 *    A production implementation would book against a persisted prior-close
 *    mark for every position rather than deriving it here.
 */
import { AssetClass } from "@/lib/domain/instrument";
import type { Portfolio, Position, PortfolioSnapshot } from "@/lib/domain/portfolio";

export function emptyExposureByAssetClass(): Record<AssetClass, number> {
  const out = {} as Record<AssetClass, number>;
  for (const ac of AssetClass.options) out[ac] = 0;
  return out;
}

export interface SnapshotInputs {
  portfolio: Portfolio;
  /** All positions of the portfolio (open and closed); closed ones only feed realised/day PnL. */
  positions: Position[];
  asOf: string;
  /** ISO start of the current UTC day, used by the dayPnl heuristic. */
  startOfDay: string;
}

export function computeSnapshot({ portfolio, positions, asOf, startOfDay }: SnapshotInputs): PortfolioSnapshot {
  const open = positions.filter((p) => p.closedAt === null);
  const exposureByAssetClass = emptyExposureByAssetClass();
  let gross = 0;
  let net = 0;
  let unrealized = 0;
  let top: { symbol: string; abs: number } | null = null;
  for (const p of open) {
    const abs = Math.abs(p.marketValue);
    gross += abs;
    net += p.marketValue;
    unrealized += p.unrealizedPnl;
    exposureByAssetClass[p.assetClass] += abs;
    if (!top || abs > top.abs) top = { symbol: p.symbol, abs };
  }
  const nav = portfolio.cash + net;
  const realized = positions.reduce((s, p) => s + p.realizedPnl, 0);
  const dayPnl =
    open.reduce((s, p) => s + dayPnlOf(p, startOfDay), 0) +
    positions.filter((p) => p.closedAt !== null && p.closedAt >= startOfDay).reduce((s, p) => s + p.realizedPnl, 0);
  return {
    portfolioId: portfolio.id,
    asOf,
    nav,
    cash: portfolio.cash,
    grossExposure: gross,
    netExposure: net,
    grossLeverage: nav > 0 ? gross / nav : 0,
    unrealizedPnl: unrealized,
    realizedPnl: realized,
    dayPnl,
    inceptionReturnPct: portfolio.inceptionCapital > 0 ? (nav - portfolio.inceptionCapital) / portfolio.inceptionCapital : 0,
    positionCount: open.length,
    exposureByAssetClass,
    topConcentration: top && nav > 0 ? { symbol: top.symbol, pctOfNav: top.abs / nav } : null,
  };
}

/** Re-mark a position at `mark` given the instrument multiplier. */
export function remark(position: Position, mark: number, multiplier: number): Pick<Position, "markPrice" | "marketValue" | "unrealizedPnl"> {
  return {
    markPrice: mark,
    marketValue: position.quantity * mark * multiplier,
    unrealizedPnl: (mark - position.averagePrice) * position.quantity * multiplier,
  };
}

/**
 * Day PnL contribution of a single open position. Prefers the prior-close
 * mark; falls back to full unrealised PnL for positions opened today, and to
 * zero for older positions with no prior close on record.
 */
export function dayPnlOf(p: Position, startOfDay: string): number {
  if (p.previousClose !== null && p.markPrice !== 0) {
    return (p.marketValue * (p.markPrice - p.previousClose)) / p.markPrice;
  }
  return p.openedAt >= startOfDay ? p.unrealizedPnl : 0;
}
