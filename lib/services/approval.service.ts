import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Actor, Principal } from "@/lib/domain/auth";
import { ApprovalDecisionInput, CreateApprovalInput, type ApprovalRequest, type ApprovalStatus, type ApprovalType } from "@/lib/domain/approval";
import type { ApprovalRepository } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { ApprovalService, AuditService } from "./interfaces";
import { PortfolioScope, actorOf, assertDeskVisible, requirePermission } from "./authz";
import { addHoursIso } from "./helpers/time";

/** Default approval lifetime. */
export const APPROVAL_TTL_HOURS = 24;

/** Expiry timestamp for a new approval request (now + 24h). */
export function defaultApprovalExpiry(clock: Clock): string {
  return addHoursIso(clock.now(), APPROVAL_TTL_HOURS);
}

/**
 * Callback invoked after an approval is decided. Services subscribe per
 * approval type (OrderService for 'order', StrategyService for
 * 'strategy_deploy') so the ApprovalService has no constructor dependency on them.
 */
export type ApprovalOutcomeHandler = (approval: ApprovalRequest, approved: boolean, decidedBy: Actor, note: string) => Promise<void>;

/** Four-eyes approvals with a type-keyed outcome handler registry. */
export class ApprovalServiceImpl implements ApprovalService {
  private readonly handlers = new Map<ApprovalType, ApprovalOutcomeHandler[]>();

  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly scope: PortfolioScope,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  /** Subscribe to decisions for an approval type. */
  onDecided(type: ApprovalType, handler: ApprovalOutcomeHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  /** Requires approvals:read and desk/portfolio visibility. */
  async get(principal: Principal, id: string): Promise<ApprovalRequest> {
    requirePermission(principal, "approvals:read");
    const approval = await this.approvals.findById(id);
    if (!approval) throw new NotFoundError("ApprovalRequest", id);
    this.assertVisible(principal, approval);
    return approval;
  }

  /** Requires approvals:read. Scoped to visible portfolios for non-global principals. */
  async list(principal: Principal, filter: { status?: ApprovalStatus; type?: ApprovalRequest["type"]; portfolioId?: string }, page: PageQuery): Promise<Paged<ApprovalRequest>> {
    requirePermission(principal, "approvals:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.approvals.list({ ...filter, ...scoped }, page);
  }

  /** Create a pending approval (no principal: called by services on behalf of users/agents). Audits approval.requested. */
  async request(input: CreateApprovalInput): Promise<ApprovalRequest> {
    const parsed = CreateApprovalInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid approval request", parsed.error.flatten());
    const approval = await this.approvals.create({
      ...parsed.data,
      id: this.ids.next(ID_PREFIX.approval),
      status: "pending",
      createdAt: this.clock.nowIso(),
      decidedByUserId: null,
      decisionNote: null,
      decidedAt: null,
    });
    await this.audit.record({
      action: "approval.requested",
      actor: approval.requestedBy,
      targetType: "ApprovalRequest",
      targetId: approval.id,
      portfolioId: approval.portfolioId,
      deskId: approval.deskId,
      summary: `Approval requested (${approval.type}): ${approval.subjectLabel}`,
      data: { type: approval.type, subjectId: approval.subjectId, notional: approval.notional, reason: approval.reason },
      ip: null,
    });
    return approval;
  }

  /**
   * Requires approvals:decide. Four-eyes: the decider may not be the user who
   * requested. The request must be pending and unexpired. Dispatches the
   * outcome to registered handlers after persisting the decision.
   */
  async decide(principal: Principal, id: string, input: ApprovalDecisionInput): Promise<ApprovalRequest> {
    requirePermission(principal, "approvals:decide");
    const parsed = ApprovalDecisionInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid decision", parsed.error.flatten());
    const approval = await this.approvals.findById(id);
    if (!approval) throw new NotFoundError("ApprovalRequest", id);
    this.assertVisible(principal, approval);
    if (approval.requestedBy.kind === "user" && approval.requestedBy.id === principal.userId) {
      throw new ForbiddenError("Four-eyes: the requester cannot decide their own approval");
    }
    if (approval.status !== "pending") throw new InvalidStateError(`Approval is ${approval.status}`);
    const now = this.clock.nowIso();
    if (approval.expiresAt < now) {
      await this.approvals.update(id, { status: "expired" });
      throw new InvalidStateError("Approval has expired");
    }
    const approved = parsed.data.decision === "approve";
    const decided = await this.approvals.update(id, {
      status: approved ? "approved" : "rejected",
      decidedByUserId: principal.userId,
      decisionNote: parsed.data.note,
      decidedAt: now,
    });
    const decidedBy = actorOf(principal);
    await this.audit.record({
      action: "approval.decided",
      actor: decidedBy,
      targetType: "ApprovalRequest",
      targetId: id,
      portfolioId: decided.portfolioId,
      deskId: decided.deskId,
      summary: `${approved ? "Approved" : "Rejected"} (${decided.type}): ${decided.subjectLabel}`,
      data: { decision: parsed.data.decision, note: parsed.data.note, subjectId: decided.subjectId },
      ip: null,
    });
    for (const handler of this.handlers.get(decided.type) ?? []) {
      await handler(decided, approved, decidedBy, parsed.data.note);
    }
    if (!this.handlers.has(decided.type)) this.logger.debug("No outcome handler registered for approval type", { type: decided.type });
    return decided;
  }

  /** Cancel the pending approval (if any) for a subject. Idempotent. */
  async cancel(subjectId: string, reason: string): Promise<void> {
    const pending = await this.approvals.findPendingBySubject(subjectId);
    if (!pending) return;
    await this.approvals.update(pending.id, { status: "cancelled", decisionNote: reason, decidedAt: this.clock.nowIso() });
  }

  /** Pending approvals visible to the principal. */
  async pendingCount(principal: Principal): Promise<number> {
    const scoped = await this.scope.filter(principal);
    return (await this.approvals.list({ status: "pending", ...scoped }, { limit: 1, offset: 0 })).total;
  }

  private assertVisible(principal: Principal, approval: ApprovalRequest): void {
    if (principal.allDesks) return;
    if (approval.deskId) assertDeskVisible(principal, approval.deskId);
    else if (approval.portfolioId === null) throw new ForbiddenError("Platform-level approvals are only visible to global roles");
  }
}
