import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { PortfolioStatusBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/portfolios/[id]">;

const get = withAuth("portfolios:read", ({ principal, params }) => services().portfolios.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const patch = withAuth("portfolios:manage", ({ principal, params, body }) => services().portfolios.updateStatus(principal, params.id, body.status), { body: PortfolioStatusBody });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);
