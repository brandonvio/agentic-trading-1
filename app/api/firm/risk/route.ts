import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("risk:read", ({ principal }) => services().risk.firmReport(principal));
