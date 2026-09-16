import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/strategies/[id]/resume">;

const post = withAuth("strategies:pause", ({ principal, params }) => services().strategies.resume(principal, params.id));
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
