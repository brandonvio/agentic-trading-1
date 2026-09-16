import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { StrategyListQuery } from "@/lib/api/schemas";
import { CreateStrategyInput } from "@/lib/domain/strategy";

export const GET = withAuth("strategies:read", ({ principal, query, page }) => services().strategies.list(principal, query, page), { query: StrategyListQuery });

export const POST = withAuth("strategies:create", ({ principal, body }) => services().strategies.create(principal, body), { body: CreateStrategyInput });
