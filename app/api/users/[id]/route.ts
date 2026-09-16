import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { UpdateUserInput } from "@/lib/domain/auth";

type Ctx = RouteContext<"/api/users/[id]">;

const get = withAuth("users:read", ({ principal, params }) => services().users.get(principal, params.id));
export const GET = (req: NextRequest, ctx: Ctx) => get(req, ctx);

const patch = withAuth("users:manage", ({ principal, params, body }) => services().users.update(principal, params.id, body), { body: UpdateUserInput });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);
