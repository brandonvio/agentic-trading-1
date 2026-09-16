import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import type { Principal } from "@/lib/domain/auth";

/**
 * Per-request dashboard loaders. Each is `cache()`d so independent sections can
 * await the same service call without re-running it, and each is wrapped in
 * `safe()` so a missing permission degrades one card rather than the page.
 */
async function principal(): Promise<Principal> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.principal;
}

const page = (limit: number) => ({ limit, offset: 0 });

/** Reference timestamp for relative times; stable for the whole request. */
export const loadNow = cache(async (): Promise<number> => Date.now());

export const loadFirmSnapshot = cache(() => safe(async () => services().portfolios.firmSnapshot(await principal())));

export const loadFirmRisk = cache(() => safe(async () => services().risk.firmReport(await principal())));

export const loadPortfolios = cache(() => safe(async () => services().portfolios.list(await principal(), {}, page(200))));

export const loadPendingApprovals = cache(() => safe(async () => services().approvals.pendingCount(await principal())));

export const loadAgentUsage = cache(() => safe(async () => services().agents.usageStats(await principal())));

export const loadRecentRuns = cache(() => safe(async () => services().agents.listRuns(await principal(), {}, page(6))));

export const loadOpenBreaches = cache(() =>
  safe(async () => services().risk.listBreaches(await principal(), { status: "open" }, page(6))),
);

export const loadLatestSignals = cache(() =>
  safe(async () => services().signals.list(await principal(), { status: "new" }, page(6))),
);

export const loadMarketOverview = cache(() => safe(async () => services().market.getMarketOverview(await principal())));
