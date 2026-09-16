import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { RiskLimitListQuery } from "@/lib/api/schemas";
import { CreateRiskLimitInput } from "@/lib/domain/risk";

export const GET = withAuth("risk:read", ({ principal, query, page }) => services().risk.listLimits(principal, query, page), { query: RiskLimitListQuery });

export const POST = withAuth("risk:limits:write", ({ principal, body }) => services().risk.createLimit(principal, body), { body: CreateRiskLimitInput });
