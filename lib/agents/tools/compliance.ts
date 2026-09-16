/**
 * Compliance and wrap-up tools.
 *
 * A compliance finding is not a quantitative limit breach, but it belongs in
 * the same review queue as one, so it is persisted as a `RiskBreach` with a
 * synthetic limit (`policy:<policy>`) and a binary observation (1 finding
 * against a tolerance of 0) alongside an `AuditEvent`.
 */
import { z } from "zod";
import { ID_PREFIX } from "@/lib/core/ids";
import type { RiskBreach, RiskMetric } from "@/lib/domain/risk";
import { defineTool, type ToolDefinition } from "./registry";
import { PortfolioIdInput, agentActor, resolvePortfolioId } from "./shared";

/** Closest quantitative proxy for a policy finding; observed/threshold encode "1 finding, tolerance 0". */
const POLICY_METRIC: RiskMetric = "open_orders_count";

/** `{ breachId, severity, subjectType, subjectId, policy, description }`. */
export const flagComplianceIssue = defineTool({
  name: "flag_compliance_issue",
  description:
    "Record a formal compliance finding against an order, signal, agent or portfolio. Use it for anything material: an agent order without a rationale, trading through a breached limit, concentration outside the mandate, a wash-trade pattern, or an action with no audit trail. Name the specific policy and the specific subject id — a finding without a subject is not actionable. The finding is persisted for the compliance officer and cannot be withdrawn by an agent.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    subjectType: z.enum(["order", "signal", "agent", "portfolio"]).describe("What the finding is about."),
    subjectId: z.string().min(1).describe("Id of the order, signal, agent or portfolio concerned."),
    policy: z.string().min(1).max(120).describe("Policy key, e.g. agent-orders-require-rationale."),
    severity: z.enum(["info", "warning", "critical"]).default("warning").describe("Materiality of the finding."),
    description: z.string().min(1).max(2000).describe("What happened, with the evidence, in one or two sentences."),
  }),
  permission: "risk:read",
  kinds: ["compliance", "risk_sentinel"],
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const actor = agentActor(ctx);
    const message = `[${input.policy}] ${input.description}`;
    const breach: RiskBreach = {
      id: ctx.ids.next(ID_PREFIX.riskBreach),
      limitId: `policy:${input.policy}`,
      limitName: `Policy: ${input.policy}`,
      metric: POLICY_METRIC,
      scope: "portfolio",
      scopeId: portfolioId,
      portfolioId,
      observed: 1,
      threshold: 0,
      // The tool contract records compliance findings at warning severity; the
      // model's own grading is preserved in the audit payload and the message.
      severity: "warning",
      status: "open",
      message,
      actionTaken: `Compliance finding recorded by ${ctx.agent.name} for review`,
      detectedBy: actor,
      detectedAt: ctx.clock.nowIso(),
      acknowledgedByUserId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionNote: null,
    };
    const created = await ctx.repos.riskBreaches.create(breach);
    await ctx.services.audit.record({
      action: "risk.breach_detected",
      actor,
      targetType: input.subjectType,
      targetId: input.subjectId,
      portfolioId,
      deskId: ctx.agent.deskId,
      summary: `Compliance finding on ${input.subjectType} ${input.subjectId}: ${input.policy}`,
      data: { breachId: created.id, policy: input.policy, severity: input.severity, description: input.description, runId: ctx.run.id },
      ip: null,
    });
    return {
      breachId: created.id,
      status: created.status,
      severity: input.severity,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      policy: input.policy,
      description: input.description,
      detectedAt: created.detectedAt,
    };
  },
});

/** Echoes the final structured summary back so it is persisted as a step. */
export const summarizeRun = defineTool({
  name: "summarize_run",
  description:
    "Record the final structured summary of this run. Call it once, at the end, with the same summary you are about to put in your JSON output: a short narrative, the key findings, and the ids of anything you created. It writes nothing to the book and is always available.",
  schema: z.object({
    summary: z.string().min(1).max(4000).describe("Two or three sentences a portfolio manager can read in ten seconds."),
    findings: z.array(z.string().max(500)).default([]).describe("Bullet-point findings, most important first."),
    signalIds: z.array(z.string()).default([]).describe("Signal ids created during this run."),
    orderIds: z.array(z.string()).default([]).describe("Order ids created during this run."),
    confidence: z.number().min(0).max(1).optional().describe("Overall confidence from 0 to 1."),
  }),
  allowAdvisory: true,
  async execute(input, ctx) {
    return {
      runId: ctx.run.id,
      agentId: ctx.agent.id,
      at: ctx.clock.nowIso(),
      summary: input.summary,
      findings: input.findings,
      signalIds: input.signalIds.length ? input.signalIds : [...ctx.created.signalIds],
      orderIds: input.orderIds.length ? input.orderIds : [...ctx.created.orderIds],
      confidence: input.confidence ?? null,
    };
  },
});

export const COMPLIANCE_TOOLS: readonly ToolDefinition[] = [flagComplianceIssue, summarizeRun];
