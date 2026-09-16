import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { QuotesQuery } from "@/lib/api/schemas";

export const GET = withAuth("market:read", ({ principal, query }) => services().market.getQuotes(principal, query.ids), { query: QuotesQuery });
