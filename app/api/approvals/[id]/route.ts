import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/approvals/[id]">;

const get = withAuth("approvals:read", ({ principal, params }) => services().approvals.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);
