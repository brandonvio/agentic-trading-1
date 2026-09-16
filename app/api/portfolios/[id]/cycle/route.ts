import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/portfolios/[id]/cycle">;

const post = withAuth("agents:run", ({ principal, params }) => services().agents.runPortfolioCycle(principal, params.id));
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
