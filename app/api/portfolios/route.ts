import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { PortfolioListQuery } from "@/lib/api/schemas";

export const GET = withAuth("portfolios:read", ({ principal, query, page }) => services().portfolios.list(principal, query, page), { query: PortfolioListQuery });
