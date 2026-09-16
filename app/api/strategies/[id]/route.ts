import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { UpdateStrategyInput } from "@/lib/domain/strategy";

type Ctx = RouteContext<"/api/strategies/[id]">;

const get = withAuth("strategies:read", ({ principal, params }) => services().strategies.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const patch = withAuth("strategies:create", ({ principal, params, body }) => services().strategies.update(principal, params.id, body), { body: UpdateStrategyInput });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);
