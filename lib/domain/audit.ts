import { z } from "zod";
import { Actor } from "./auth";

export const AuditAction = z.enum([
  "auth.login",
  "auth.logout",
  "user.created",
  "user.updated",
  "order.created",
  "order.risk_checked",
  "order.approval_requested",
  "order.routed",
  "order.filled",
  "order.cancelled",
  "order.rejected",
  "position.closed",
  "strategy.created",
  "strategy.updated",
  "strategy.deployed",
  "strategy.paused",
  "agent.created",
  "agent.updated",
  "agent.run_started",
  "agent.run_finished",
  "agent.killed",
  "signal.created",
  "signal.dismissed",
  "risk.limit_created",
  "risk.limit_updated",
  "risk.breach_detected",
  "risk.breach_resolved",
  "approval.requested",
  "approval.decided",
  "broker.connected",
  "broker.disconnected",
  "seed.completed",
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEvent = z.object({
  id: z.string(),
  action: AuditAction,
  actor: Actor,
  /** Entity type + id the event concerns. */
  targetType: z.string(),
  targetId: z.string(),
  portfolioId: z.string().nullable().default(null),
  deskId: z.string().nullable().default(null),
  summary: z.string(),
  /** Arbitrary structured payload (diffs, amounts, ids). */
  data: z.record(z.string(), z.unknown()).default({}),
  ip: z.string().nullable().default(null),
  at: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const CreateAuditEventInput = AuditEvent.omit({ id: true, at: true });
export type CreateAuditEventInput = z.infer<typeof CreateAuditEventInput>;

export const AuditFilter = z.object({
  action: AuditAction.optional(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  portfolioId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type AuditFilter = z.infer<typeof AuditFilter>;
