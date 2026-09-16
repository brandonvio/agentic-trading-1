import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("agents:read", ({ principal }) => services().agents.usageStats(principal));
