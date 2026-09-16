import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("desks:read", ({ principal, page }) => services().desks.list(principal, page));
