import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { SignalListQuery } from "@/lib/api/schemas";

export const GET = withAuth("agents:read", ({ principal, query, page }) => services().signals.list(principal, query, page), { query: SignalListQuery });
