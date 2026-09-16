import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/signals/[id]">;

const get = withAuth("agents:read", ({ principal, params }) => services().signals.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
