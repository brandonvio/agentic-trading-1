import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { SignalActBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/signals/[id]/act">;

const post = withAuth("orders:create", ({ principal, params, body }) => services().signals.act(principal, params.id, body), { body: SignalActBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
