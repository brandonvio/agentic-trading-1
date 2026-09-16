import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import type { AuditAction } from "@/lib/domain/audit";
import { AUDIT_LIMIT } from "./format";

export const loadAuditEvents = cache(
  (action?: AuditAction, actorId?: string, targetType?: string, portfolioId?: string, from?: string, to?: string) =>
    safe(async () => services().audit.list(await principal(), { action, actorId, targetType, portfolioId, from, to }, page(AUDIT_LIMIT))),
);
