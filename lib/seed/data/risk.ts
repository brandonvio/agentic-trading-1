/**
 * Risk limits, the breaches they produced and the four-eyes approval queue.
 *
 * Limits are generated before orders so order-level risk checks can name a
 * real rule; breaches and approvals are generated afterwards so they can point
 * at the orders they concern.
 */
import type { RiskBreach, RiskBreachSeverity, RiskBreachStatus, RiskLimit, RiskLimitAction, RiskLimitScope, RiskMetric } from "@/lib/domain/risk";
import type { ApprovalRequest, ApprovalStatus, ApprovalType } from "@/lib/domain/approval";
import type { Order } from "@/lib/domain/order";
import { SYSTEM_ACTOR, type Actor } from "@/lib/domain/auth";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, type SeedContext } from "../context";
import type { OrgBundle } from "./org";
import type { PortfolioBundle, PortfolioCode } from "./portfolios";
import type { StrategyBundle } from "./strategies";
import type { AgentBundle } from "./agents";

interface LimitSpec {
  name: string;
  scope: RiskLimitScope;
  /** Portfolio code, desk code, or agent key depending on scope. */
  target: string | null;
  metric: RiskMetric;
  qualifier: string | null;
  threshold: number;
  warnThreshold: number | null;
  action: RiskLimitAction;
  enabled: boolean;
  createdBy: string;
}

const LIMIT_SPECS: readonly LimitSpec[] = [
  { name: "Platform gross exposure ceiling", scope: "platform", target: null, metric: "gross_exposure_pct_nav", qualifier: null, threshold: 5.0, warnThreshold: 4.2, action: "block", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Platform daily loss circuit breaker", scope: "platform", target: null, metric: "daily_loss_pct_nav", qualifier: null, threshold: -0.03, warnThreshold: -0.02, action: "auto_unwind", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Platform single-order notional ceiling", scope: "platform", target: null, metric: "order_notional", qualifier: null, threshold: 50_000_000, warnThreshold: 35_000_000, action: "require_approval", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Platform agent daily notional budget", scope: "platform", target: null, metric: "agent_daily_notional", qualifier: null, threshold: 100_000_000, warnThreshold: 75_000_000, action: "block", enabled: true, createdBy: "marcus.okonkwo@agenticprop.io" },
  { name: "Platform drawdown escalation", scope: "platform", target: null, metric: "drawdown_pct", qualifier: null, threshold: -0.12, warnThreshold: -0.08, action: "warn", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Global Macro desk VaR budget", scope: "desk", target: "GM", metric: "var_95_pct_nav", qualifier: null, threshold: 0.03, warnThreshold: 0.024, action: "warn", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Equity Derivatives desk gross cap", scope: "desk", target: "EQD", metric: "gross_exposure_pct_nav", qualifier: null, threshold: 3.0, warnThreshold: 2.5, action: "block", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Systematic Futures margin ceiling", scope: "desk", target: "SYS", metric: "margin_utilization_pct", qualifier: null, threshold: 0.6, warnThreshold: 0.5, action: "warn", enabled: true, createdBy: "grace.kim@agenticprop.io" },
  { name: "Digital Assets desk drawdown halt", scope: "desk", target: "DA", metric: "drawdown_pct", qualifier: null, threshold: -0.18, warnThreshold: -0.12, action: "require_approval", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "GM-ALPHA single-instrument concentration", scope: "portfolio", target: "GM-ALPHA", metric: "single_instrument_pct_nav", qualifier: null, threshold: 0.15, warnThreshold: 0.12, action: "require_approval", enabled: true, createdBy: "elena.varga@agenticprop.io" },
  { name: "GM-ALPHA gross leverage cap", scope: "portfolio", target: "GM-ALPHA", metric: "gross_exposure_pct_nav", qualifier: null, threshold: 4.0, warnThreshold: 3.2, action: "block", enabled: true, createdBy: "elena.varga@agenticprop.io" },
  { name: "GM-CARRY daily loss limit", scope: "portfolio", target: "GM-CARRY", metric: "daily_loss_pct_nav", qualifier: null, threshold: -0.02, warnThreshold: -0.014, action: "auto_unwind", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "EQD-VOL option exposure cap", scope: "portfolio", target: "EQD-VOL", metric: "asset_class_pct_nav", qualifier: "option", threshold: 0.9, warnThreshold: 0.75, action: "warn", enabled: true, createdBy: "daniel.reyes@agenticprop.io" },
  { name: "EQD-VOL working order ceiling", scope: "portfolio", target: "EQD-VOL", metric: "open_orders_count", qualifier: null, threshold: 40, warnThreshold: 30, action: "block", enabled: true, createdBy: "grace.kim@agenticprop.io" },
  { name: "SYS-TREND value at risk budget", scope: "portfolio", target: "SYS-TREND", metric: "var_95_pct_nav", qualifier: null, threshold: 0.035, warnThreshold: 0.028, action: "warn", enabled: true, createdBy: "priya.raghunathan@agenticprop.io" },
  { name: "DA-CORE crypto concentration", scope: "portfolio", target: "DA-CORE", metric: "asset_class_pct_nav", qualifier: "crypto", threshold: 1.4, warnThreshold: 1.2, action: "warn", enabled: true, createdBy: "kenji.watanabe@agenticprop.io" },
  { name: "DA-CORE net exposure guard", scope: "portfolio", target: "DA-CORE", metric: "net_exposure_pct_nav", qualifier: null, threshold: 1.2, warnThreshold: 1.0, action: "require_approval", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "EV-MACRO per-contract concentration", scope: "portfolio", target: "EV-MACRO", metric: "single_instrument_pct_nav", qualifier: null, threshold: 0.1, warnThreshold: 0.08, action: "block", enabled: true, createdBy: "sofia.marchetti@agenticprop.io" },
  { name: "Compass PM autonomous notional cap", scope: "agent", target: "compass-pm", metric: "agent_daily_notional", qualifier: null, threshold: 45_000_000, warnThreshold: 34_000_000, action: "require_approval", enabled: true, createdBy: "rachel.goldberg@agenticprop.io" },
  { name: "Nexus Execution per-order cap", scope: "agent", target: "nexus-exec", metric: "order_notional", qualifier: null, threshold: 5_000_000, warnThreshold: 4_000_000, action: "block", enabled: true, createdBy: "kenji.watanabe@agenticprop.io" },
  { name: "Vega Execution legacy notional cap", scope: "agent", target: "vega-exec", metric: "order_notional", qualifier: null, threshold: 20_000_000, warnThreshold: 15_000_000, action: "warn", enabled: false, createdBy: "daniel.reyes@agenticprop.io" },
];

export interface RiskLimitBundle {
  limits: RiskLimit[];
  limitByName: (name: string) => RiskLimit;
}

export function generateRiskLimits(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  agents: AgentBundle,
): RiskLimitBundle {
  const limits: RiskLimit[] = LIMIT_SPECS.map((spec) => {
    let scopeId: string | null = null;
    if (spec.scope === "desk" && spec.target) scopeId = org.deskByCode(spec.target as Parameters<typeof org.deskByCode>[0]).id;
    if (spec.scope === "portfolio" && spec.target) scopeId = portfolios.portfolioByCode(spec.target as PortfolioCode).id;
    if (spec.scope === "agent" && spec.target) scopeId = agents.agentByKey(spec.target).id;
    const createdAt = ctx.daysAgo(ctx.rng.range(60, 380));
    return {
      id: ctx.ids.next(ID_PREFIX.riskLimit),
      name: spec.name,
      scope: spec.scope,
      scopeId,
      metric: spec.metric,
      qualifier: spec.qualifier,
      threshold: spec.threshold,
      warnThreshold: spec.warnThreshold,
      action: spec.action,
      enabled: spec.enabled,
      createdByUserId: org.userByEmail(spec.createdBy).id,
      createdAt,
      updatedAt: ctx.daysAgo(ctx.rng.range(1, 45)),
    };
  });

  const limitByName = (name: string): RiskLimit => {
    const l = limits.find((x) => x.name === name);
    if (!l) throw new Error(`Seed generation error: unknown risk limit ${name}`);
    return l;
  };

  return { limits, limitByName };
}

interface BreachSpec {
  limitName: string;
  portfolio: PortfolioCode | null;
  observed: number;
  severity: RiskBreachSeverity;
  status: RiskBreachStatus;
  hoursAgo: number;
  message: string;
  actionTaken: string;
  detectedByAgentKey: string | null;
  resolver: string | null;
  resolutionNote: string | null;
}

const BREACH_SPECS: readonly BreachSpec[] = [
  { limitName: "GM-ALPHA single-instrument concentration", portfolio: "GM-ALPHA", observed: 0.336, severity: "critical", status: "open", hoursAgo: 3.2, message: "The December E-mini position reached 33.6% of NAV against a 15.0% single-instrument limit after the overnight rally.", actionTaken: "Risk sentinel requested a $14.2m index hedge and routed it for approval; further risk-increasing orders in ESZ6 are blocked.", detectedByAgentKey: "meridian-risk", resolver: null, resolutionNote: null },
  { limitName: "EQD-VOL option exposure cap", portfolio: "EQD-VOL", observed: 0.83, severity: "warning", status: "acknowledged", hoursAgo: 9.5, message: "Option gross exposure reached 83% of NAV, above the 75% warning band but below the 90% hard cap.", actionTaken: "Warning raised to the portfolio manager; no orders blocked. The December expiry will reduce the exposure mechanically.", detectedByAgentKey: null, resolver: null, resolutionNote: null },
  { limitName: "Systematic Futures margin ceiling", portfolio: "SYS-TREND", observed: 0.54, severity: "warning", status: "acknowledged", hoursAgo: 21, message: "Margin utilisation on the Tradovate account reached 54% of buying power against a 50% warning threshold.", actionTaken: "Operations notified; the risk sentinel scaled the trend book down by 6% proportionally across markets.", detectedByAgentKey: "compass-risk", resolver: null, resolutionNote: null },
  { limitName: "DA-CORE net exposure guard", portfolio: "DA-CORE", observed: 1.29, severity: "critical", status: "resolved", hoursAgo: 52, message: "Net crypto exposure reached 129% of NAV against a 120% limit following the momentum overlay's Monday rebalance.", actionTaken: "Momentum overlay reduced by a third; an approval request was raised and approved before the reduction was executed.", detectedByAgentKey: "nexus-risk", resolver: "kenji.watanabe@agenticprop.io", resolutionNote: "Overlay trimmed to 82% of target. Net exposure back to 111% of NAV and stable across two subsequent rebalances." },
  { limitName: "GM-CARRY daily loss limit", portfolio: "GM-CARRY", observed: -0.016, severity: "warning", status: "resolved", hoursAgo: 76, message: "The carry basket was down 1.6% on the day against a 1.4% warning threshold after the yen squeeze.", actionTaken: "Basket halved automatically per the volatility filter; no manual intervention required.", detectedByAgentKey: null, resolver: "elena.varga@agenticprop.io", resolutionNote: "Basket restored to full weight once one-month implied volatility fell back below its 80th percentile." },
  { limitName: "Platform agent daily notional budget", portfolio: null, observed: 82_400_000, severity: "info", status: "resolved", hoursAgo: 30, message: "Agent-originated notional reached $82.4m against a $75.0m warning threshold and a $100.0m daily budget.", actionTaken: "Informational only. The CIO was notified and the budget reset at the session boundary.", detectedByAgentKey: null, resolver: "marcus.okonkwo@agenticprop.io", resolutionNote: "Daily budget rolled at 22:00Z with $17.6m unused. No orders were blocked." },
  { limitName: "EV-MACRO per-contract concentration", portfolio: "EV-MACRO", observed: 0.104, severity: "warning", status: "open", hoursAgo: 6.8, message: "The December FOMC contract reached 10.4% of NAV against a 10.0% hard cap; further buys in that contract are blocked.", actionTaken: "Buy orders in FED-DEC26-CUT are blocked until the position is trimmed or NAV rises.", detectedByAgentKey: null, resolver: null, resolutionNote: null },
  { limitName: "Nexus Execution per-order cap", portfolio: "DA-CORE", observed: 5_400_000, severity: "critical", status: "acknowledged", hoursAgo: 14.4, message: "The execution agent attempted a $5.4m child order against its $5.0m per-order cap; the order was blocked before routing.", actionTaken: "Order blocked by the risk engine. The agent re-sliced the parent into three child orders inside the cap.", detectedByAgentKey: null, resolver: null, resolutionNote: null },
];

export interface RiskEventBundle {
  breaches: RiskBreach[];
  approvals: ApprovalRequest[];
}

interface ExtraApproval {
  type: ApprovalType;
  status: ApprovalStatus;
  subject: "strategy" | "agent";
  subjectKey: string;
  label: string;
  reason: string;
  riskSummary: string;
  notional: number;
  requester: string;
  decider: string | null;
  note: string | null;
  hoursAgo: number;
}

const EXTRA_APPROVALS: readonly ExtraApproval[] = [
  { type: "strategy_deploy", status: "pending", subject: "strategy", subjectKey: "MRES", label: "Deploy Intraday Mean Reversion (ES) to Systematic Trend", reason: "Research has completed the out-of-sample sweep and requests a $40m paper allocation ahead of live capital.", riskSummary: "Deflated Sharpe of 0.71 over 24 out-of-sample months. Adds 0.4% to portfolio VaR and no new asset classes. Capacity limited to $40m by opening-auction liquidity.", notional: 40_000_000, requester: "wei.zhang@agenticprop.io", decider: null, note: null, hoursAgo: 18 },
  { type: "agent_autonomy_change", status: "pending", subject: "agent", subjectKey: "nexus-pm", label: "Raise Nexus PM · Digital Assets Core from supervised to autonomous", reason: "Ninety days of supervised operation with no rejected orders; the desk requests autonomous operation inside the existing $12m per-run cap.", riskSummary: "182 supervised orders, zero approval rejections, mean slippage 1.9 basis points. Autonomy would remove human review for orders below the $5m portfolio threshold only.", notional: 12_000_000, requester: "kenji.watanabe@agenticprop.io", decider: null, note: null, hoursAgo: 41 },
  { type: "risk_override", status: "expired", subject: "agent", subjectKey: "compass-pm", label: "Temporary VaR budget override for the trend rebalance", reason: "The nightly rebalance would have breached the VaR budget by 0.2 points for roughly two hours during the roll.", riskSummary: "Requested override of 0.035 to 0.038 for four hours. Expired unactioned; the rebalance was split across two sessions instead.", notional: 45_000_000, requester: "priya.raghunathan@agenticprop.io", decider: null, note: null, hoursAgo: 96 },
];

export function generateRiskEvents(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  strategies: StrategyBundle,
  agents: AgentBundle,
  limits: RiskLimitBundle,
  orders: Order[],
): RiskEventBundle {
  const breaches: RiskBreach[] = BREACH_SPECS.map((spec) => {
    const limit = limits.limitByName(spec.limitName);
    const portfolioId = spec.portfolio ? portfolios.portfolioByCode(spec.portfolio).id : null;
    const detectedBy: Actor = spec.detectedByAgentKey
      ? { kind: "agent", id: agents.agentByKey(spec.detectedByAgentKey).id, name: agents.agentByKey(spec.detectedByAgentKey).name }
      : SYSTEM_ACTOR;
    const detectedAt = ctx.hoursAgo(spec.hoursAgo);
    const resolver = spec.resolver ? org.userByEmail(spec.resolver) : null;
    return {
      id: ctx.ids.next(ID_PREFIX.riskBreach),
      limitId: limit.id,
      limitName: limit.name,
      metric: limit.metric,
      scope: limit.scope,
      scopeId: limit.scopeId,
      portfolioId,
      observed: spec.observed,
      threshold: limit.threshold,
      severity: spec.severity,
      status: spec.status,
      message: spec.message,
      actionTaken: spec.actionTaken,
      detectedBy,
      detectedAt,
      acknowledgedByUserId: spec.status === "open" ? null : org.userByEmail("rachel.goldberg@agenticprop.io").id,
      resolvedByUserId: resolver ? resolver.id : null,
      resolvedAt: spec.status === "resolved" ? ctx.hoursAgo(Math.max(0.5, spec.hoursAgo - ctx.rng.range(1, 8))) : null,
      resolutionNote: spec.resolutionNote,
    };
  });

  const approvals: ApprovalRequest[] = [];
  const cro = org.userByEmail("rachel.goldberg@agenticprop.io");

  for (const order of orders) {
    if (order.status !== "PENDING_APPROVAL" && order.status !== "APPROVAL_REJECTED") continue;
    const portfolio = portfolios.portfolios.find((p) => p.id === order.portfolioId);
    if (!portfolio) continue;
    const rejected = order.status === "APPROVAL_REJECTED";
    const approvalId = ctx.ids.next(ID_PREFIX.approval);
    order.approvalId = approvalId;
    approvals.push({
      id: approvalId,
      type: "order",
      status: rejected ? "rejected" : "pending",
      subjectId: order.id,
      subjectLabel: `${order.side} ${order.quantity} ${order.symbol} (${order.type})`,
      portfolioId: portfolio.id,
      deskId: portfolio.deskId,
      requestedBy: order.createdBy,
      reason: `Order notional of ${formatUsd(order.estimatedNotional)} exceeds the ${portfolio.code} agent approval threshold of ${formatUsd(portfolio.mandate.agentApprovalThresholdNotional)}.`,
      riskSummary: `Post-trade gross exposure ${round(portfolio.mandate.maxGrossLeverage * 0.72, 2)}x NAV against a ${portfolio.mandate.maxGrossLeverage}x mandate cap. Single-instrument exposure would move to ${round(portfolio.mandate.maxConcentration * 0.86 * 100, 1)}% of NAV. No other limit is inside its warning band.`,
      requiredPermission: "orders:approve",
      notional: order.estimatedNotional,
      decidedByUserId: rejected ? cro.id : null,
      decisionNote: rejected ? "Rejected: the requester could not evidence that the position fits the current risk budget. Resubmit with a hedge attached." : null,
      decidedAt: rejected ? order.completedAt : null,
      createdAt: order.createdAt,
      expiresAt: ctx.shift(order.createdAt, 8 * 3_600_000),
    });
  }

  // One historic order approval that was granted, for the decided-approvals view.
  const approvedOrder = orders.find((o) => o.status === "FILLED" && o.origin === "agent" && o.estimatedNotional > 0);
  if (approvedOrder) {
    const portfolio = portfolios.portfolios.find((p) => p.id === approvedOrder.portfolioId);
    if (portfolio) {
      const approvalId = ctx.ids.next(ID_PREFIX.approval);
      approvedOrder.approvalId = approvalId;
      approvals.push({
        id: approvalId,
        type: "order",
        status: "approved",
        subjectId: approvedOrder.id,
        subjectLabel: `${approvedOrder.side} ${approvedOrder.quantity} ${approvedOrder.symbol} (${approvedOrder.type})`,
        portfolioId: portfolio.id,
        deskId: portfolio.deskId,
        requestedBy: approvedOrder.createdBy,
        reason: `Agent-originated order of ${formatUsd(approvedOrder.estimatedNotional)} above the ${portfolio.code} approval threshold.`,
        riskSummary: "Post-trade exposure inside every applicable limit; the order reduces the portfolio's largest concentration rather than adding to it.",
        requiredPermission: "orders:approve",
        notional: approvedOrder.estimatedNotional,
        decidedByUserId: org.users.find((u) => u.id === portfolio.managerUserId)?.id ?? cro.id,
        decisionNote: "Approved. The trade is risk-reducing and the rationale matches the desk's current view.",
        decidedAt: approvedOrder.submittedAt,
        createdAt: approvedOrder.createdAt,
        expiresAt: ctx.shift(approvedOrder.createdAt, 8 * 3_600_000),
      });
    }
  }

  for (const spec of EXTRA_APPROVALS) {
    const requester = org.userByEmail(spec.requester);
    const subjectId = spec.subject === "strategy"
      ? strategies.strategyByCode(spec.subjectKey as Parameters<typeof strategies.strategyByCode>[0]).id
      : agents.agentByKey(spec.subjectKey).id;
    const createdAt = ctx.hoursAgo(spec.hoursAgo);
    approvals.push({
      id: ctx.ids.next(ID_PREFIX.approval),
      type: spec.type,
      status: spec.status,
      subjectId,
      subjectLabel: spec.label,
      portfolioId: null,
      deskId: requester.deskIds[0] ?? null,
      requestedBy: { kind: "user", id: requester.id, name: requester.name },
      reason: spec.reason,
      riskSummary: spec.riskSummary,
      requiredPermission: spec.type === "strategy_deploy" ? "strategies:deploy" : "agents:configure",
      notional: spec.notional,
      decidedByUserId: spec.decider ? org.userByEmail(spec.decider).id : null,
      decisionNote: spec.note,
      decidedAt: null,
      createdAt,
      expiresAt: ctx.shift(createdAt, 48 * 3_600_000),
    });
  }

  return { breaches, approvals };
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${round(value / 1_000_000, 1)}m`;
  if (value >= 1_000) return `$${round(value / 1_000, 1)}k`;
  return `$${round(value, 0)}`;
}
