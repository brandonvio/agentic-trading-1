import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ReasonBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/agent-runs/[id]/kill">;

const post = withAuth("agents:kill", ({ principal, params, body }) => services().agents.kill(principal, params.id, body.reason), { body: ReasonBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
