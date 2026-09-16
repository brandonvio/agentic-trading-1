import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { hasPermission } from "@/lib/auth/permissions";
import { page, principal } from "@/app/(app)/_lib/data";

export const loadBrokers = cache(() => safe(async () => services().brokers.listBrokers(await principal())));

export const loadBrokerAccounts = cache(() => safe(async () => services().brokers.listAccounts(await principal(), {}, page(500))));

/** Whether the viewer may reconcile accounts or change their status. */
export const loadCanManage = cache(async (): Promise<boolean> => hasPermission(await principal(), "brokers:manage"));
