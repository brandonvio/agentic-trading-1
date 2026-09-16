import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { PositionListQuery } from "@/lib/api/schemas";

export const GET = withAuth("positions:read", ({ principal, query, page }) => services().portfolios.listPositions(principal, query, page), { query: PositionListQuery });
