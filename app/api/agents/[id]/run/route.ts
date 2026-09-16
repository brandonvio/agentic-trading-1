import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { AgentRunBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/agents/[id]/run">;

const post = withAuth("agents:run", ({ principal, params, body }) => services().agents.run(principal, params.id, { ...body, trigger: "manual" }), { body: AgentRunBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
