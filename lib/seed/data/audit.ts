/**
 * The audit trail. Events are derived from the entities the rest of the seed
 * produced, so every target id resolves and every summary matches the state of
 * the thing it describes. Ids are assigned after sorting so they run in
 * chronological order.
 */
import type { AuditAction, AuditEvent } from "@/lib/domain/audit";
import type { AgentRun, Signal } from "@/lib/domain/agent";
import type { Order } from "@/lib/domain/order";
import type { RiskBreach, RiskLimit } from "@/lib/domain/risk";
import type { ApprovalRequest } from "@/lib/domain/approval";
import { SYSTEM_ACTOR, type Actor } from "@/lib/domain/auth";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, type SeedContext } from "../context";
import type { OrgBundle } from "./org";
import type { PortfolioBundle } from "./portfolios";
import type { StrategyBundle } from "./strategies";
import type { AgentBundle } from "./agents";

type Draft = Omit<AuditEvent, "id">;

const OFFICE_IPS = ["10.42.7.18", "10.42.7.24", "10.42.8.91", "10.42.9.13", "198.51.100.44", "203.0.113.17"];

export interface AuditInputs {
  runs: readonly AgentRun[];
  signals: readonly Signal[];
  orders: readonly Order[];
  breaches: readonly RiskBreach[];
  approvals: readonly ApprovalRequest[];
  limits: readonly RiskLimit[];
}

export function generateAuditEvents(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  strategies: StrategyBundle,
  agents: AgentBundle,
  inputs: AuditInputs,
): AuditEvent[] {
  const drafts: Draft[] = [];
  const deskOf = (portfolioId: string | null): string | null => {
    if (!portfolioId) return null;
    return portfolios.portfolios.find((p) => p.id === portfolioId)?.deskId ?? null;
  };
  const userActor = (userId: string): Actor => {
    const u = org.users.find((x) => x.id === userId);
    if (!u) throw new Error(`Seed generation error: audit references unknown user ${userId}`);
    return { kind: "user", id: u.id, name: u.name };
  };

  // --- Sessions ------------------------------------------------------------
  for (const user of org.users) {
    if (!user.lastLoginAt) continue;
    drafts.push({
      action: "auth.login",
      actor: { kind: "user", id: user.id, name: user.name },
      targetType: "user",
      targetId: user.id,
      portfolioId: null,
      deskId: user.deskIds[0] ?? null,
      summary: `${user.name} signed in.`,
      data: { roles: user.roles, method: "sso" },
      ip: ctx.rng.pick(OFFICE_IPS),
      at: user.lastLoginAt,
    });
    // A second session earlier in the week for the most active desks.
    if (user.deskIds.length > 0 && ctx.rng.chance(0.45)) {
      drafts.push({
        action: "auth.login",
        actor: { kind: "user", id: user.id, name: user.name },
        targetType: "user",
        targetId: user.id,
        portfolioId: null,
        deskId: user.deskIds[0],
        summary: `${user.name} signed in.`,
        data: { roles: user.roles, method: "sso" },
        ip: ctx.rng.pick(OFFICE_IPS),
        at: ctx.hoursAgo(ctx.rng.range(26, 160)),
      });
    }
  }

  // --- Orders --------------------------------------------------------------
  // Only the most recent slice of the order book is audited in detail; the
  // trail is a rolling window, not a full replay of every order ever placed.
  const auditedOrders = [...inputs.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 16);
  for (const order of auditedOrders) {
    const desk = deskOf(order.portfolioId);
    const base = { targetType: "order", targetId: order.id, portfolioId: order.portfolioId, deskId: desk, ip: null };
    drafts.push({
      ...base,
      action: "order.created",
      actor: order.createdBy,
      summary: `${order.origin === "manual" ? "Manual" : order.origin === "agent" ? "Agent" : order.origin === "strategy" ? "Strategy" : "Risk unwind"} order: ${order.side} ${order.quantity} ${order.symbol} ${order.type}.`,
      data: { side: order.side, quantity: order.quantity, type: order.type, estimatedNotional: order.estimatedNotional, origin: order.origin },
      at: order.createdAt,
    });
    if (order.riskChecks.length > 0 && ctx.rng.chance(0.35)) {
      const failed = order.riskChecks.filter((c) => !c.passed);
      drafts.push({
        ...base,
        action: "order.risk_checked",
        actor: SYSTEM_ACTOR,
        summary: failed.length > 0 ? `Risk check failed on ${failed[0].rule}.` : `Risk check passed: ${order.riskChecks.length} rules evaluated.`,
        data: { rulesEvaluated: order.riskChecks.length, failed: failed.length },
        at: ctx.shift(order.createdAt, 180),
      });
    }
    if (order.approvalId) {
      drafts.push({
        ...base,
        action: "order.approval_requested",
        actor: order.createdBy,
        summary: `Approval requested for ${order.side} ${order.quantity} ${order.symbol}; notional above the portfolio threshold.`,
        data: { approvalId: order.approvalId, notional: order.estimatedNotional },
        at: ctx.shift(order.createdAt, 400),
      });
    }
    if (order.submittedAt && order.status !== "ERROR") {
      drafts.push({
        ...base,
        action: "order.routed",
        actor: SYSTEM_ACTOR,
        summary: `Routed to ${order.broker.toUpperCase()} as ${order.externalOrderId ?? "unassigned"}.`,
        data: { broker: order.broker, externalOrderId: order.externalOrderId },
        at: order.submittedAt,
      });
    }
    if (order.status === "FILLED" && order.completedAt) {
      drafts.push({
        ...base,
        action: "order.filled",
        actor: SYSTEM_ACTOR,
        summary: `Filled ${order.filledQuantity} ${order.symbol} at an average of ${order.averageFillPrice ?? 0}.`,
        data: { filledQuantity: order.filledQuantity, averageFillPrice: order.averageFillPrice },
        at: order.completedAt,
      });
    }
    if (order.status === "CANCELLED" && order.completedAt) {
      drafts.push({
        ...base,
        action: "order.cancelled",
        actor: order.createdBy,
        summary: order.rejectionReason ?? "Order cancelled.",
        data: { filledQuantity: order.filledQuantity },
        at: order.completedAt,
      });
    }
    if ((order.status === "RISK_REJECTED" || order.status === "APPROVAL_REJECTED" || order.status === "ERROR") && order.completedAt) {
      drafts.push({
        ...base,
        action: "order.rejected",
        actor: SYSTEM_ACTOR,
        summary: order.rejectionReason ?? "Order rejected.",
        data: { status: order.status },
        at: order.completedAt,
      });
    }
  }

  // --- Agent runs ----------------------------------------------------------
  const auditedRuns = [...inputs.runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 12);
  for (const run of auditedRuns) {
    const desk = deskOf(run.portfolioId);
    const agentActor: Actor = { kind: "agent", id: run.agentId, name: run.agentName, runId: run.id };
    drafts.push({
      action: "agent.run_started",
      actor: run.triggeredBy,
      targetType: "agent_run",
      targetId: run.id,
      portfolioId: run.portfolioId,
      deskId: desk,
      summary: `${run.agentName} started a ${run.trigger} run: ${run.objective}`,
      data: { agentId: run.agentId, trigger: run.trigger },
      ip: run.triggeredBy.kind === "user" ? ctx.rng.pick(OFFICE_IPS) : null,
      at: run.startedAt,
    });
    if (run.finishedAt) {
      drafts.push({
        action: run.status === "killed" ? "agent.killed" : "agent.run_finished",
        actor: run.status === "killed" ? userActor(org.userByEmail("rachel.goldberg@agenticprop.io").id) : agentActor,
        targetType: "agent_run",
        targetId: run.id,
        portfolioId: run.portfolioId,
        deskId: desk,
        summary: run.status === "succeeded"
          ? `${run.agentName} finished in ${run.stepCount} steps at a cost of $${round(run.costUsd, 2)}.`
          : `${run.agentName} run ended with status ${run.status}.`,
        data: { status: run.status, stepCount: run.stepCount, costUsd: run.costUsd, inputTokens: run.inputTokens, outputTokens: run.outputTokens },
        ip: null,
        at: run.finishedAt,
      });
    }
  }

  // --- Signals -------------------------------------------------------------
  for (const signal of inputs.signals) {
    const agent = signal.agentId ? agents.agents.find((a) => a.id === signal.agentId) : null;
    drafts.push({
      action: "signal.created",
      actor: agent ? { kind: "agent", id: agent.id, name: agent.name, ...(signal.runId ? { runId: signal.runId } : {}) } : SYSTEM_ACTOR,
      targetType: "signal",
      targetId: signal.id,
      portfolioId: signal.portfolioId,
      deskId: deskOf(signal.portfolioId),
      summary: `${signal.direction} ${signal.symbol} at ${round(signal.conviction * 100, 0)}% conviction over ${round(signal.horizonHours / 24, 1)} days.`,
      data: { direction: signal.direction, conviction: signal.conviction, expectedReturnPct: signal.expectedReturnPct, strategyId: signal.strategyId },
      ip: null,
      at: signal.createdAt,
    });
  }

  // --- Risk ----------------------------------------------------------------
  for (const breach of inputs.breaches) {
    drafts.push({
      action: "risk.breach_detected",
      actor: breach.detectedBy,
      targetType: "risk_breach",
      targetId: breach.id,
      portfolioId: breach.portfolioId,
      deskId: deskOf(breach.portfolioId),
      summary: breach.message,
      data: { metric: breach.metric, observed: breach.observed, threshold: breach.threshold, severity: breach.severity },
      ip: null,
      at: breach.detectedAt,
    });
    if (breach.status === "resolved" && breach.resolvedAt && breach.resolvedByUserId) {
      drafts.push({
        action: "risk.breach_resolved",
        actor: userActor(breach.resolvedByUserId),
        targetType: "risk_breach",
        targetId: breach.id,
        portfolioId: breach.portfolioId,
        deskId: deskOf(breach.portfolioId),
        summary: breach.resolutionNote ?? "Breach resolved.",
        data: { metric: breach.metric, actionTaken: breach.actionTaken },
        ip: ctx.rng.pick(OFFICE_IPS),
        at: breach.resolvedAt,
      });
    }
  }
  for (const limit of inputs.limits.slice(0, 3)) {
    drafts.push({
      action: "risk.limit_updated",
      actor: userActor(limit.createdByUserId),
      targetType: "risk_limit",
      targetId: limit.id,
      portfolioId: limit.scope === "portfolio" ? limit.scopeId : null,
      deskId: limit.scope === "desk" ? limit.scopeId : null,
      summary: `${limit.name} threshold reviewed and left at ${limit.threshold}.`,
      data: { metric: limit.metric, threshold: limit.threshold, action: limit.action },
      ip: ctx.rng.pick(OFFICE_IPS),
      at: ctx.hoursAgo(ctx.rng.range(12, 150)),
    });
  }

  // --- Approvals -----------------------------------------------------------
  for (const approval of inputs.approvals) {
    drafts.push({
      action: "approval.requested",
      actor: approval.requestedBy,
      targetType: "approval",
      targetId: approval.id,
      portfolioId: approval.portfolioId,
      deskId: approval.deskId,
      summary: `${approval.type.replace("_", " ")} approval requested: ${approval.subjectLabel}.`,
      data: { type: approval.type, notional: approval.notional, subjectId: approval.subjectId },
      ip: approval.requestedBy.kind === "user" ? ctx.rng.pick(OFFICE_IPS) : null,
      at: approval.createdAt,
    });
    if (approval.decidedByUserId && approval.decidedAt) {
      drafts.push({
        action: "approval.decided",
        actor: userActor(approval.decidedByUserId),
        targetType: "approval",
        targetId: approval.id,
        portfolioId: approval.portfolioId,
        deskId: approval.deskId,
        summary: `${approval.status === "approved" ? "Approved" : "Rejected"}: ${approval.subjectLabel}.`,
        data: { status: approval.status, note: approval.decisionNote },
        ip: ctx.rng.pick(OFFICE_IPS),
        at: approval.decidedAt,
      });
    }
  }

  // --- Strategies and connectivity ----------------------------------------
  const strategyEvents: ReadonlyArray<readonly [string, AuditAction, string]> = [
    ["TREND", "strategy.updated", "Trend ensemble bumped to version 6: the 120-day horizon weight was raised from 0.25 to 0.30."],
    ["BASIS", "strategy.paused", "Basis strategy paused pending the Coinbase connectivity review; open carry positions are being held to expiry."],
    ["VRP", "strategy.deployed", "Vol risk premium redeployed to Equity Volatility after the wing-selection change cleared research review."],
    ["MRES", "strategy.updated", "Mean reversion parameters frozen for the out-of-sample evaluation window."],
  ];
  for (const [code, action, summary] of strategyEvents) {
    const strategy = strategies.strategyByCode(code as Parameters<typeof strategies.strategyByCode>[0]);
    drafts.push({
      action,
      actor: userActor(strategy.ownerUserId),
      targetType: "strategy",
      targetId: strategy.id,
      portfolioId: strategy.deployments[0]?.portfolioId ?? null,
      deskId: strategy.deskId,
      summary,
      data: { code: strategy.code, version: strategy.version },
      ip: ctx.rng.pick(OFFICE_IPS),
      at: ctx.hoursAgo(ctx.rng.range(10, 160)),
    });
  }
  const degraded = portfolios.brokerAccounts.find((a) => a.status === "degraded");
  if (degraded) {
    const ops = org.userByEmail("grace.kim@agenticprop.io");
    drafts.push({
      action: "broker.disconnected",
      actor: SYSTEM_ACTOR,
      targetType: "broker_account",
      targetId: degraded.id,
      portfolioId: degraded.portfolioId,
      deskId: deskOf(degraded.portfolioId),
      summary: `${degraded.label} heartbeat stale for over three hours; the account is marked degraded and agent trading is suspended on it.`,
      data: { broker: degraded.broker, lastHeartbeatAt: degraded.lastHeartbeatAt },
      ip: null,
      at: ctx.hoursAgo(3.4),
    });
    drafts.push({
      action: "broker.connected",
      actor: { kind: "user", id: ops.id, name: ops.name },
      targetType: "broker_account",
      targetId: degraded.id,
      portfolioId: degraded.portfolioId,
      deskId: deskOf(degraded.portfolioId),
      summary: `${degraded.label} session re-established after a credential rotation; monitoring for stability before re-enabling agent trading.`,
      data: { broker: degraded.broker },
      ip: ctx.rng.pick(OFFICE_IPS),
      at: ctx.hoursAgo(2.9),
    });
  }

  const sevenDaysAgo = ctx.daysAgo(7);
  const kept = drafts.filter((d) => d.at >= sevenDaysAgo && d.at <= ctx.nowIso).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return kept.map((d) => ({ id: ctx.ids.next(ID_PREFIX.audit), ...d }));
}
