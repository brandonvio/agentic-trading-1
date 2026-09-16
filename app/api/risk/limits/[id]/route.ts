import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { UpdateRiskLimitInput } from "@/lib/domain/risk";

type Ctx = RouteContext<"/api/risk/limits/[id]">;

const patch = withAuth("risk:limits:write", ({ principal, params, body }) => services().risk.updateLimit(principal, params.id, body), { body: UpdateRiskLimitInput });
export const PATCH = (req: NextRequest, ctx: Ctx) => patch(req, ctx);

const del = withAuth("risk:limits:write", async ({ principal, params }) => {
  await services().risk.deleteLimit(principal, params.id);
  return { id: params.id, deleted: true };
});
export const DELETE = (req: NextRequest, ctx: Ctx) => del(req, ctx);
