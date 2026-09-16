import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { AuditEvent, AuditFilter, CreateAuditEventInput } from "@/lib/domain/audit";
import type { AuditRepository } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { AuditService } from "./interfaces";
import { PortfolioScope, requirePermission } from "./authz";

/** Persists audit events and exposes a scoped, permission-checked listing. */
export class AuditServiceImpl implements AuditService {
  constructor(
    private readonly audit: AuditRepository,
    private readonly scope: PortfolioScope,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Assign id/timestamp and persist. Never throws for authorization: any service may record. */
  async record(input: CreateAuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: this.ids.next(ID_PREFIX.audit),
      at: this.clock.nowIso(),
      portfolioId: input.portfolioId ?? null,
      deskId: input.deskId ?? null,
      data: input.data ?? {},
      ip: input.ip ?? null,
      action: input.action,
      actor: input.actor,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
    };
    return this.audit.create(event);
  }

  /** Requires audit:read. Non-global principals only see events tagged with a visible portfolio. */
  async list(principal: Principal, filter: AuditFilter, page: PageQuery): Promise<Paged<AuditEvent>> {
    requirePermission(principal, "audit:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.audit.list({ ...filter, ...scoped }, page);
  }
}
