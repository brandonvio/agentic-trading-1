import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { OrderListQuery } from "@/lib/api/schemas";
import { CreateOrderInput } from "@/lib/domain/order";

export const GET = withAuth("orders:read", ({ principal, query, page }) => services().orders.list(principal, query, page), { query: OrderListQuery });

export const POST = withAuth("orders:create", ({ principal, body }) => services().orders.submit(principal, body), { body: CreateOrderInput });
