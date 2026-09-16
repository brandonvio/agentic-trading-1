import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/desks/[id]">;

const get = withAuth("desks:read", ({ principal, params }) => services().desks.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
