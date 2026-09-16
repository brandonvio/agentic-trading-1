import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { AgentRunListQuery } from "@/lib/api/schemas";

export const GET = withAuth("agents:read", ({ principal, query, page }) => services().agents.listRuns(principal, query, page), { query: AgentRunListQuery });
