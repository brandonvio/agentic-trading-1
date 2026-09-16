import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { InstrumentListQuery } from "@/lib/api/schemas";

export const GET = withAuth("market:read", ({ principal, query, page }) => services().market.listInstruments(principal, query, page), { query: InstrumentListQuery });
