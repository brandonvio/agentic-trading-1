import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/instruments/[id]">;

const get = withAuth("market:read", ({ principal, params }) => services().market.getInstrument(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
