import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("market:read", ({ principal }) => services().market.getMarketOverview(principal));
