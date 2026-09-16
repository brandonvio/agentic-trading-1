import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/positions/[id]">;

const get = withAuth("positions:read", ({ principal, params }) => services().portfolios.getPosition(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
