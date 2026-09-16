import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/portfolios/[id]/snapshot">;

const get = withAuth("portfolios:read", ({ principal, params }) => services().portfolios.snapshot(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
