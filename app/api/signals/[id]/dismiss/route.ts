import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ReasonBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/signals/[id]/dismiss">;

const post = withAuth(["agents:run", "orders:create"], ({ principal, params, body }) => services().signals.dismiss(principal, params.id, body.reason), { body: ReasonBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
