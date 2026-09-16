/**
 * Status → visual tone maps. Badges and dots read these so every screen
 * colours a given status identically.
 */
import type { OrderStatus } from "@/lib/domain/order";
import type { AgentRunStatus, AgentStatus, SignalStatus } from "@/lib/domain/agent";
import type { ApprovalStatus } from "@/lib/domain/approval";
import type { RiskBreachSeverity, RiskBreachStatus } from "@/lib/domain/risk";
import type { PortfolioStatus, BrokerAccountStatus } from "@/lib/domain/portfolio";
import type { StrategyStatus } from "@/lib/domain/strategy";
import type { MarketOverview } from "@/lib/services/interfaces";

export type Tone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info" | "muted";

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  DRAFT: "muted",
  PENDING_RISK: "info",
  RISK_REJECTED: "negative",
  PENDING_APPROVAL: "warning",
  APPROVAL_REJECTED: "negative",
  ROUTED: "accent",
  ACKNOWLEDGED: "accent",
  PARTIALLY_FILLED: "info",
  FILLED: "positive",
  CANCELLED: "muted",
  ERROR: "negative",
};

export const AGENT_RUN_STATUS_TONE: Record<AgentRunStatus, Tone> = {
  queued: "muted",
  running: "accent",
  succeeded: "positive",
  failed: "negative",
  killed: "warning",
  budget_exhausted: "warning",
};

export const AGENT_STATUS_TONE: Record<AgentStatus, Tone> = {
  idle: "neutral",
  running: "accent",
  paused: "warning",
  disabled: "muted",
  error: "negative",
};

export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, Tone> = {
  pending: "warning",
  approved: "positive",
  rejected: "negative",
  expired: "muted",
  cancelled: "muted",
};

export const RISK_SEVERITY_TONE: Record<RiskBreachSeverity, Tone> = {
  info: "info",
  warning: "warning",
  critical: "negative",
};

export const RISK_BREACH_STATUS_TONE: Record<RiskBreachStatus, Tone> = {
  open: "negative",
  acknowledged: "warning",
  resolved: "positive",
};

export const PORTFOLIO_STATUS_TONE: Record<PortfolioStatus, Tone> = {
  active: "positive",
  frozen: "warning",
  liquidating: "negative",
  closed: "muted",
};

export const STRATEGY_STATUS_TONE: Record<StrategyStatus, Tone> = {
  research: "muted",
  backtested: "info",
  paper: "accent",
  live: "positive",
  paused: "warning",
  retired: "muted",
};

export const SIGNAL_STATUS_TONE: Record<SignalStatus, Tone> = {
  new: "accent",
  acted: "positive",
  expired: "muted",
  dismissed: "muted",
};

export const BROKER_ACCOUNT_STATUS_TONE: Record<BrokerAccountStatus, Tone> = {
  connected: "positive",
  degraded: "warning",
  disconnected: "negative",
  paper: "info",
};

export const MARKET_REGIME_TONE: Record<MarketOverview["regime"], Tone> = {
  risk_on: "positive",
  risk_off: "negative",
  neutral: "neutral",
  volatile: "warning",
};

export const SIDE_TONE: Record<"BUY" | "SELL", Tone> = { BUY: "positive", SELL: "negative" };

export const DIRECTION_TONE: Record<"LONG" | "SHORT" | "FLAT" | "HEDGE", Tone> = {
  LONG: "positive",
  SHORT: "negative",
  FLAT: "muted",
  HEDGE: "info",
};

export const STATUS_TONES = {
  order: ORDER_STATUS_TONE,
  agentRun: AGENT_RUN_STATUS_TONE,
  agent: AGENT_STATUS_TONE,
  approval: APPROVAL_STATUS_TONE,
  riskSeverity: RISK_SEVERITY_TONE,
  riskBreach: RISK_BREACH_STATUS_TONE,
  portfolio: PORTFOLIO_STATUS_TONE,
  strategy: STRATEGY_STATUS_TONE,
  signal: SIGNAL_STATUS_TONE,
  brokerAccount: BROKER_ACCOUNT_STATUS_TONE,
  regime: MARKET_REGIME_TONE,
  side: SIDE_TONE,
  direction: DIRECTION_TONE,
} as const;

export type StatusKind = keyof typeof STATUS_TONES;

/** Look up the tone for a status of the given kind; unknown values fall back to neutral. */
export function toneFor(kind: StatusKind, value: string | null | undefined): Tone {
  if (!value) return "muted";
  const map = STATUS_TONES[kind] as Record<string, Tone>;
  return map[value] ?? "neutral";
}

/** Tone for a signed number (P&L, change). */
export function toneForSign(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

/** Tone for a utilisation fraction (0..1+) against warn / breach thresholds. */
export function toneForUtilization(fraction: number, warnAt = 0.8, breachAt = 1): Tone {
  if (fraction >= breachAt) return "negative";
  if (fraction >= warnAt) return "warning";
  return "positive";
}
