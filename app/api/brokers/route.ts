import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";

export const GET = withAuth("brokers:read", ({ principal }) => services().brokers.listBrokers(principal));
