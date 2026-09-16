import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { AgentListQuery } from "@/lib/api/schemas";
import { CreateAgentInput } from "@/lib/domain/agent";

export const GET = withAuth("agents:read", ({ principal, query, page }) => services().agents.list(principal, query, page), { query: AgentListQuery });

export const POST = withAuth("agents:configure", ({ principal, body }) => services().agents.create(principal, body), { body: CreateAgentInput });
