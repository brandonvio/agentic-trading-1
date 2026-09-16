import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/portfolios/[id]/risk">;

const get = withAuth("risk:read", ({ principal, params }) => services().risk.report(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
