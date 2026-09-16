import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { DeployStrategyBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/strategies/[id]/deploy">;

const post = withAuth("strategies:deploy", ({ principal, params, body }) => services().strategies.deploy(principal, params.id, body.portfolioId, body.allocatedCapital, body.mode), { body: DeployStrategyBody });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
