import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { UpdateAgentInput } from "@/lib/domain/agent";

type Ctx = RouteContext<"/api/agents/[id]">;

const get = withAuth("agents:read", ({ principal, params }) => services().agents.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const patch = withAuth("agents:configure", ({ principal, params, body }) => services().agents.update(principal, params.id, body), { body: UpdateAgentInput });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);
