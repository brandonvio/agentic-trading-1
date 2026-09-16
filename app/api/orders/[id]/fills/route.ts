import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/orders/[id]/fills">;

const get = withAuth("orders:read", ({ principal, params }) => services().orders.listFills(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
