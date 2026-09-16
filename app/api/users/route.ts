import { withAuth } from "@/lib/api/handler";
import { services } from "@/lib/container";
import { UserListQuery } from "@/lib/api/schemas";
import { CreateUserInput } from "@/lib/domain/auth";

export const GET = withAuth("users:read", ({ principal, query, page }) => services().users.list(principal, query, page), { query: UserListQuery });

export const POST = withAuth("users:manage", ({ principal, body }) => services().users.create(principal, body), { body: CreateUserInput });
