import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { AuditFilter } from "@/lib/domain/audit";

export const GET = withAuth("audit:read", ({ principal, query, page }) => services().audit.list(principal, query, page), { query: AuditFilter });
