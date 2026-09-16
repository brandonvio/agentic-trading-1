import { z } from "zod";
import { Timestamped } from "./common";
import { Actor } from "./auth";

export const RiskLimitScope = z.enum(["platform", "desk", "portfolio", "strategy", "agent"]);
export type RiskLimitScope = z.infer<typeof RiskLimitScope>;

/**
 * Metrics the risk engine can evaluate. Each RiskLimit names one metric and a
 * threshold; the RiskService knows how to compute the metric for a scope.
 */
export const RiskMetric = z.enum([
  "gross_exposure_pct_nav", // gross notional / NAV
  "net_exposure_pct_nav",
  "single_instrument_pct_nav",
  "asset_class_pct_nav",
  "daily_loss_pct_nav", // realised+unrealised day PnL / NAV (negative = loss)
  "drawdown_pct", // peak-to-trough
  "var_95_pct_nav", // 1-day 95% VaR / NAV
  "order_notional", // single order notional
  "agent_daily_notional", // notional originated by agents per day
  "open_orders_count",
  "margin_utilization_pct",
  /** Non-numeric policy finding raised by a compliance agent; observed 1 = violated. */
  "policy_violation",
]);
export type RiskMetric = z.infer<typeof RiskMetric>;

export const RiskLimitAction = z.enum(["warn", "block", "require_approval", "auto_unwind"]);
export type RiskLimitAction = z.infer<typeof RiskLimitAction>;

export const RiskLimit = Timestamped.extend({
  id: z.string(),
  name: z.string(),
  scope: RiskLimitScope,
  /** Id of the desk/portfolio/strategy/agent; null for platform scope. */
  scopeId: z.string().nullable(),
  metric: RiskMetric,
  /** Optional qualifier, e.g. asset class for asset_class_pct_nav. */
  qualifier: z.string().nullable().default(null),
  /** Threshold in metric units (fractions for *_pct_*, base ccy for notional). */
  threshold: z.number(),
  /** Soft threshold that triggers a warning before the hard threshold. */
  warnThreshold: z.number().nullable().default(null),
  action: RiskLimitAction,
  enabled: z.boolean(),
  createdByUserId: z.string(),
});
export type RiskLimit = z.infer<typeof RiskLimit>;

export const CreateRiskLimitInput = RiskLimit.omit({ id: true, createdAt: true, updatedAt: true, createdByUserId: true });
export type CreateRiskLimitInput = z.infer<typeof CreateRiskLimitInput>;
export const UpdateRiskLimitInput = CreateRiskLimitInput.partial();
export type UpdateRiskLimitInput = z.infer<typeof UpdateRiskLimitInput>;

export const RiskBreachSeverity = z.enum(["info", "warning", "critical"]);
export type RiskBreachSeverity = z.infer<typeof RiskBreachSeverity>;

export const RiskBreachStatus = z.enum(["open", "acknowledged", "resolved"]);
export type RiskBreachStatus = z.infer<typeof RiskBreachStatus>;

export const RiskBreach = z.object({
  id: z.string(),
  limitId: z.string(),
  limitName: z.string(),
  metric: RiskMetric,
  scope: RiskLimitScope,
  scopeId: z.string().nullable(),
  portfolioId: z.string().nullable(),
  observed: z.number(),
  threshold: z.number(),
  severity: RiskBreachSeverity,
  status: RiskBreachStatus,
  message: z.string(),
  /** What the system did (blocked order X, opened approval Y, asked risk sentinel to hedge). */
  actionTaken: z.string(),
  detectedBy: Actor,
  detectedAt: z.string(),
  acknowledgedByUserId: z.string().nullable().default(null),
  resolvedByUserId: z.string().nullable().default(null),
  resolvedAt: z.string().nullable().default(null),
  resolutionNote: z.string().nullable().default(null),
});
export type RiskBreach = z.infer<typeof RiskBreach>;

export const CreateRiskBreachInput = RiskBreach.omit({ id: true });
export type CreateRiskBreachInput = z.infer<typeof CreateRiskBreachInput>;

/** Computed risk picture for a portfolio; not persisted. */
export interface RiskReport {
  portfolioId: string;
  asOf: string;
  nav: number;
  grossExposurePctNav: number;
  netExposurePctNav: number;
  var95PctNav: number;
  dailyLossPctNav: number;
  drawdownPct: number;
  marginUtilizationPct: number;
  largestPosition: { symbol: string; pctNav: number } | null;
  limits: Array<{
    limit: RiskLimit;
    observed: number;
    utilizationPct: number;
    status: "ok" | "warning" | "breached";
  }>;
}
