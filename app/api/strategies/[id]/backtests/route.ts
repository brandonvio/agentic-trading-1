import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { BacktestBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/strategies/[id]/backtests">;

const get = withAuth("research:read", ({ principal, params, page }) => services().strategies.listBacktests(principal, params.id, page));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const post = withAuth("research:backtest", ({ principal, params, body }) => services().strategies.runBacktest(principal, params.id, body), { body: BacktestBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
