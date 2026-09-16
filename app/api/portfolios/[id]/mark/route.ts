import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/portfolios/[id]/mark">;

const post = withAuth("portfolios:manage", ({ principal, params }) => services().portfolios.markToMarket(principal, params.id));
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
