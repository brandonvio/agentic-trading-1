import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/backtests/[id]">;

const get = withAuth("research:read", ({ principal, params }) => services().strategies.getBacktest(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
