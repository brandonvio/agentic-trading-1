import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { hasPermission } from "@/lib/auth/permissions";
import { page, principal } from "@/app/(app)/_lib/data";

export function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export const loadUsers = cache(() => safe(async () => services().users.list(await principal(), {}, page(500))));

export const loadRoles = cache(() => safe(async () => services().users.listRoles()));

/** Whether the viewer may create or edit users. */
export const loadCanManage = cache(async (): Promise<boolean> => hasPermission(await principal(), "users:manage"));
