/**
 * Units for risk metrics, in one place.
 *
 * Every `*_pct*` metric is stored as a FRACTION (0.03 = 3%), notional metrics
 * are in portfolio base currency, and `open_orders_count` is an integer. The
 * UI never invents a unit: it asks these helpers.
 */
import type { RiskLimitAction, RiskLimitScope, RiskMetric } from "@/lib/domain/risk";
import { formatMoney, formatNumber, formatPct, humanize } from "@/lib/ui/format";

export type MetricUnit = "fraction" | "currency" | "count";

export function metricUnit(metric: string): MetricUnit {
  if (metric.includes("pct")) return "fraction";
  if (metric === "open_orders_count") return "count";
  return "currency";
}

/** Format an observed value or threshold in the metric's own unit. */
export function formatMetricValue(metric: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  switch (metricUnit(metric)) {
    case "fraction":
      return formatPct(value, { decimals: 2 });
    case "count":
      return formatNumber(value);
    default:
      return formatMoney(value, "USD", { compact: true });
  }
}

/**
 * Thresholds are magnitudes: the risk engine compares |observed| against
 * |threshold|, so a daily-loss limit stored as -0.03 and one stored as 0.03
 * both mean "3% loss". Read-only views therefore show the magnitude.
 */
export function formatThreshold(metric: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatMetricValue(metric, Math.abs(value));
}

/** Suffix shown next to a threshold input so the unit is unmistakable. */
export function metricInputSuffix(metric: string): string {
  switch (metricUnit(metric)) {
    case "fraction":
      return "%";
    case "count":
      return "orders";
    default:
      return "USD";
  }
}

/** Stored value → the number shown in a form field (fractions become percents). */
export function toFormValue(metric: string, stored: number | null): string {
  if (stored === null || !Number.isFinite(stored)) return "";
  return metricUnit(metric) === "fraction" ? String(Number((stored * 100).toFixed(6))) : String(stored);
}

/** Form field → the stored value (percents become fractions). */
export function fromFormValue(metric: string, text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return metricUnit(metric) === "fraction" ? n / 100 : n;
}

const METRICS: RiskMetric[] = [
  "gross_exposure_pct_nav",
  "net_exposure_pct_nav",
  "single_instrument_pct_nav",
  "asset_class_pct_nav",
  "daily_loss_pct_nav",
  "drawdown_pct",
  "var_95_pct_nav",
  "order_notional",
  "agent_daily_notional",
  "open_orders_count",
  "margin_utilization_pct",
];

const SCOPES: RiskLimitScope[] = ["platform", "desk", "portfolio", "strategy", "agent"];
const ACTIONS: RiskLimitAction[] = ["warn", "block", "require_approval", "auto_unwind"];

export const METRIC_OPTIONS = METRICS.map((m) => ({ value: m, label: humanize(m) }));
export const SCOPE_OPTIONS = SCOPES.map((s) => ({ value: s, label: humanize(s) }));
export const ACTION_OPTIONS = ACTIONS.map((a) => ({ value: a, label: humanize(a) }));

export const BREACH_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

export const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

/** Qualifiers only mean something for these two metrics. */
export function qualifierHint(metric: string): string | null {
  if (metric === "single_instrument_pct_nav") return "Instrument symbol; blank means the largest position";
  if (metric === "asset_class_pct_nav") return "Asset class; blank means the largest class";
  return null;
}
