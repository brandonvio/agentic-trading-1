import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ResolveBreachBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/risk/breaches/[id]/resolve">;

const post = withAuth("risk:breaches:resolve", ({ principal, params, body }) => services().risk.resolveBreach(principal, params.id, body.note), { body: ResolveBreachBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
