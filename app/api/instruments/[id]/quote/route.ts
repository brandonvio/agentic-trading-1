import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/instruments/[id]/quote">;

const get = withAuth("market:read", ({ principal, params }) => services().market.getQuote(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
