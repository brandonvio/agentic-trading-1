import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("approvals:read", async ({ principal }) => ({ count: await services().approvals.pendingCount(principal) }));
