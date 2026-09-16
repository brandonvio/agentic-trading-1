import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("portfolios:read", ({ principal }) => services().portfolios.firmSnapshot(principal));
