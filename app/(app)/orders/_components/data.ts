import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import type { OrderFilter } from "@/lib/domain/order";

/**
 * Per-request order loaders. Each is `cache()`d so the header, table and
 * detail sections can await the same call once, and each is wrapped in
 * `safe()` so a missing permission degrades one section rather than the page.
 */
export const loadOrders = cache((filter: OrderFilter, limit = 200) =>
  safe(async () => services().orders.list(await principal(), filter, page(limit))),
);

export const loadOrder = cache((id: string) => safe(async () => services().orders.get(await principal(), id)));

export const loadFills = cache((id: string) => safe(async () => services().orders.listFills(await principal(), id)));

export const loadApproval = cache((approvalId: string) =>
  safe(async () => services().approvals.get(await principal(), approvalId)),
);

export const loadInstrument = cache((id: string) => safe(async () => services().market.getInstrument(await principal(), id)));

export const loadOrderAudit = cache((id: string) =>
  safe(async () => services().audit.list(await principal(), { targetType: "order", targetId: id }, page(50))),
);

export const loadSignal = cache((id: string) => safe(async () => services().signals.get(await principal(), id)));

export const loadStrategy = cache((id: string) => safe(async () => services().strategies.get(await principal(), id)));

export const loadRun = cache((runId: string) => safe(async () => services().agents.getRun(await principal(), runId)));