import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

type Ctx = RouteContext<"/api/brokers/accounts/[id]/reconcile">;

const post = withAuth("brokers:manage", ({ principal, params }) => services().brokers.reconcileAccount(principal, params.id));
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
