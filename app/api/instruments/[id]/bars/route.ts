import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { BarsQuery } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/instruments/[id]/bars">;

const get = withAuth("market:read", ({ principal, params, query }) => services().market.getBars(principal, params.id, query.interval, query.count), { query: BarsQuery });
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
