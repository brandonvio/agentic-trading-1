import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { BrokerAccountStatusBody } from "@/lib/api/schemas";

type Ctx = RouteContext<"/api/brokers/accounts/[id]">;

const get = withAuth("brokers:read", ({ principal, params }) => services().brokers.getAccount(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const patch = withAuth("brokers:manage", ({ principal, params, body }) => services().brokers.setAccountStatus(principal, params.id, body.status), { body: BrokerAccountStatusBody });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);
