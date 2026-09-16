import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { RiskBreachListQuery } from "@/lib/api/schemas";

export const GET = withAuth("risk:read", ({ principal, query, page }) => services().risk.listBreaches(principal, query, page), { query: RiskBreachListQuery });
