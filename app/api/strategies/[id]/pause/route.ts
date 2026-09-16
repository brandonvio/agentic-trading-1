import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ReasonBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/strategies/[id]/pause">;

const post = withAuth("strategies:pause", ({ principal, params, body }) => services().strategies.pause(principal, params.id, body.reason), { body: ReasonBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
