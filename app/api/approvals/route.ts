import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ApprovalListQuery } from "@/lib/api/schemas";

export const GET = withAuth("approvals:read", ({ principal, query, page }) => services().approvals.list(principal, query, page), { query: ApprovalListQuery });
