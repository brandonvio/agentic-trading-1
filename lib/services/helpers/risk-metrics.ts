/**
 * Pure risk-metric computations used by RiskService for reports, scans and
 * pre-trade checks.
 *
 * Model assumptions (documented, deliberately simple for the mock):
 *  - Exposures are signed market values per instrument (multiplier included).
 *  - var_95_pct_nav is parametric: per-asset-class daily volatility
 *    assumptions (DAILY_VOL) × gross exposure per class, combined as the
 *    square root of the sum of squares (zero cross-class correlation), scaled
 *    by z = 1.645 and divided by NAV.
 *  - drawdown_pct approximates the NAV peak as max(inceptionCapital, NAV at
 *    cost) because NAV history is not persisted; "NAV at cost" is
 *    NAV − min(0, unrealizedPnl), i.e. what NAV was before open positions
 *    went underwater.
 *  - daily_loss_pct_nav is reported as the loss as a positive fraction of
 *    NAV (gains give a negative observed value). Limits on it are compared
 *    against |threshold| so both `0.03` and `-0.03` mean "3% loss".
 *  - margin_utilization_pct = marginUsed / (marginUsed + buyingPower).
 *  - net_exposure_pct_nav uses |net| so the limit is symmetric.
 */
import type { AssetClass } from "@/lib/domain/instrument";
import type { RiskLimit, RiskMetric } from "@/lib/domain/risk";
import { emptyExposureByAssetClass } from "./portfolio-math";

export const DAILY_VOL: Record<AssetClass, number> = {
  equity: 0.012,
  option: 0.035,
  future: 0.015,
  forex: 0.006,
  crypto: 0.04,
  event: 0.08,
};

export const VAR_Z_95 = 1.645;

export interface ExposureLine {
  instrumentId: string;
  symbol: string;
  assetClass: AssetClass;
  /** Signed market value in base currency. */
  marketValue: number;
}

/** Everything a metric needs; built by RiskService from repositories, then optionally projected with an order. */
export interface RiskState {
  nav: number;
  cash: number;
  exposures: ExposureLine[];
  unrealizedPnl: number;
  dayPnl: number;
  inceptionCapital: number;
  openOrdersCount: number;
  agentNotionalToday: number;
  marginUsed: number;
  buyingPower: number;
  /** Notional of the order under evaluation (0 for reports/scans). */
  orderNotional: number;
}

/** Project the state as if `order` were filled at its estimated notional. */
export function projectOrder(
  state: RiskState,
  order: { instrumentId: string; symbol: string; assetClass: AssetClass; side: "BUY" | "SELL"; estimatedNotional: number; origin: string },
): RiskState {
  const delta = order.side === "BUY" ? order.estimatedNotional : -order.estimatedNotional;
  const exposures = state.exposures.map((e) => ({ ...e }));
  const line = exposures.find((e) => e.instrumentId === order.instrumentId);
  if (line) line.marketValue += delta;
  else exposures.push({ instrumentId: order.instrumentId, symbol: order.symbol, assetClass: order.assetClass, marketValue: delta });
  return {
    ...state,
    exposures,
    openOrdersCount: state.openOrdersCount + 1,
    agentNotionalToday: state.agentNotionalToday + (order.origin === "agent" ? order.estimatedNotional : 0),
    orderNotional: order.estimatedNotional,
  };
}

export function grossExposure(state: RiskState): number {
  return state.exposures.reduce((s, e) => s + Math.abs(e.marketValue), 0);
}

export function netExposure(state: RiskState): number {
  return state.exposures.reduce((s, e) => s + e.marketValue, 0);
}

export function exposureByAssetClass(state: RiskState): Record<AssetClass, number> {
  const out = emptyExposureByAssetClass();
  for (const e of state.exposures) out[e.assetClass] += Math.abs(e.marketValue);
  return out;
}

export function largestExposure(state: RiskState): ExposureLine | null {
  let best: ExposureLine | null = null;
  for (const e of state.exposures) if (!best || Math.abs(e.marketValue) > Math.abs(best.marketValue)) best = e;
  return best;
}

export function var95(state: RiskState): number {
  const byClass = exposureByAssetClass(state);
  let sumSq = 0;
  for (const ac of Object.keys(byClass) as AssetClass[]) sumSq += (DAILY_VOL[ac] * byClass[ac]) ** 2;
  return VAR_Z_95 * Math.sqrt(sumSq);
}

export function drawdownPct(state: RiskState): number {
  const navAtCost = state.nav - Math.min(0, state.unrealizedPnl);
  const peak = Math.max(state.inceptionCapital, navAtCost, state.nav);
  return peak > 0 ? (peak - state.nav) / peak : 0;
}

function pctNav(value: number, nav: number): number {
  return nav > 0 ? value / nav : value > 0 ? Number.POSITIVE_INFINITY : 0;
}

/** Observed value of a metric for the given state. `qualifier` narrows single_instrument (symbol) and asset_class (asset class). */
export function computeMetric(metric: RiskMetric, qualifier: string | null, state: RiskState): number {
  switch (metric) {
    case "gross_exposure_pct_nav":
      return pctNav(grossExposure(state), state.nav);
    case "net_exposure_pct_nav":
      return pctNav(Math.abs(netExposure(state)), state.nav);
    case "single_instrument_pct_nav": {
      if (qualifier) {
        const line = state.exposures.find((e) => e.symbol === qualifier || e.instrumentId === qualifier);
        return line ? pctNav(Math.abs(line.marketValue), state.nav) : 0;
      }
      const top = largestExposure(state);
      return top ? pctNav(Math.abs(top.marketValue), state.nav) : 0;
    }
    case "asset_class_pct_nav": {
      const byClass = exposureByAssetClass(state);
      if (qualifier && qualifier in byClass) return pctNav(byClass[qualifier as AssetClass], state.nav);
      return pctNav(Math.max(0, ...Object.values(byClass)), state.nav);
    }
    case "daily_loss_pct_nav":
      return state.nav > 0 ? -state.dayPnl / state.nav : 0;
    case "drawdown_pct":
      return drawdownPct(state);
    case "var_95_pct_nav":
      return pctNav(var95(state), state.nav);
    case "order_notional":
      return state.orderNotional;
    case "agent_daily_notional":
      return state.agentNotionalToday;
    case "open_orders_count":
      return state.openOrdersCount;
    case "margin_utilization_pct": {
      const denom = state.marginUsed + state.buyingPower;
      return denom > 0 ? state.marginUsed / denom : 0;
    }
    default:
      return 0;
  }
}

export interface LimitEvaluation {
  limit: RiskLimit;
  observed: number;
  threshold: number;
  utilizationPct: number;
  status: "ok" | "warning" | "breached";
}

/** Compare an observed value against a limit. Thresholds are magnitudes (see daily_loss note above). */
export function evaluateLimit(limit: RiskLimit, observed: number): LimitEvaluation {
  const threshold = Math.abs(limit.threshold);
  const warn = limit.warnThreshold === null ? null : Math.abs(limit.warnThreshold);
  const status: LimitEvaluation["status"] = observed > threshold ? "breached" : warn !== null && observed > warn ? "warning" : "ok";
  const utilizationPct = threshold > 0 ? Math.max(0, observed / threshold) : observed > 0 ? Number.POSITIVE_INFINITY : 0;
  return { limit, observed, threshold, utilizationPct, status };
}

export function formatMetric(metric: RiskMetric, value: number): string {
  if (metric.includes("pct")) return `${(value * 100).toFixed(2)}%`;
  if (metric === "open_orders_count") return String(Math.round(value));
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
