import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/risk/breaches/[id]/acknowledge">;

const post = withAuth("risk:read", ({ principal, params }) => services().risk.acknowledgeBreach(principal, params.id));
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
