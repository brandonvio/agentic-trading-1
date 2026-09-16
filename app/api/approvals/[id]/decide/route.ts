import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { ApprovalDecisionInput } from "@/lib/domain/approval";

type Ctx = RouteContext<"/api/approvals/[id]/decide">;

const post = withAuth("approvals:decide", ({ principal, params, body }) => services().approvals.decide(principal, params.id, body), { body: ApprovalDecisionInput });
export const POST = (req: NextRequest, ctx: Ctx) => post(req, ctx);
