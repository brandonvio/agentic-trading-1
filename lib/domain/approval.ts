import { z } from "zod";
import { Actor } from "./auth";

export const ApprovalType = z.enum([
  "order", // an order exceeded a threshold or was agent-originated under supervision
  "strategy_deploy", // going live with a strategy
  "risk_limit_change",
  "agent_autonomy_change",
  "risk_override",
]);
export type ApprovalType = z.infer<typeof ApprovalType>;

export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

/**
 * Four-eyes approval request. Requester can be a user or an agent; the decider
 * must be a user holding `approvals:decide` (and not the requester).
 */
export const ApprovalRequest = z.object({
  id: z.string(),
  type: ApprovalType,
  status: ApprovalStatus,
  /** Id of the thing being approved (order id, strategy id...). */
  subjectId: z.string(),
  subjectLabel: z.string(),
  portfolioId: z.string().nullable(),
  deskId: z.string().nullable(),
  requestedBy: Actor,
  reason: z.string(),
  /** Human-readable risk summary shown to approvers. */
  riskSummary: z.string().default(""),
  /** Which permission the decider needs. */
  requiredPermission: z.string().default("approvals:decide"),
  /** Notional at stake, for prioritisation. */
  notional: z.number().nonnegative().default(0),
  decidedByUserId: z.string().nullable().default(null),
  decisionNote: z.string().nullable().default(null),
  decidedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

export const CreateApprovalInput = ApprovalRequest.omit({
  id: true,
  status: true,
  createdAt: true,
  decidedByUserId: true,
  decisionNote: true,
  decidedAt: true,
});
export type CreateApprovalInput = z.infer<typeof CreateApprovalInput>;

export const ApprovalDecisionInput = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().default(""),
});
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionInput>;
