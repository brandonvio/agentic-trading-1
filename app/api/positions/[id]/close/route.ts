import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ClosePositionBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/positions/[id]/close">;

const post = withAuth("positions:close", ({ principal, params, body }) => services().orders.closePosition(principal, params.id, body.rationale), { body: ClosePositionBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
