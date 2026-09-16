import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { BrokerAccountListQuery } from "@/lib/api/schemas";

export const GET = withAuth("brokers:read", ({ principal, query, page }) => services().brokers.listAccounts(principal, query, page), { query: BrokerAccountListQuery });
