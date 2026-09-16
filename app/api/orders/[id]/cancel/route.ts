import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ReasonBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/orders/[id]/cancel">;

const post = withAuth("orders:cancel", ({ principal, params, body }) => services().orders.cancel(principal, params.id, body.reason), { body: ReasonBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
