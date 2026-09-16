import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";

/**
 * Per-request loaders for one portfolio. Each section awaits only what it
 * needs, and each result is `safe()`d so a missing permission (e.g. risk:read
 * for an analyst) degrades that tab alone.
 */
export const loadPortfolio = cache((id: string) => safe(async () => services().portfolios.get(await principal(), id)));

export const loadSnapshot = cache((id: string) => safe(async () => services().portfolios.snapshot(await principal(), id)));

export const loadPositions = cache((id: string) =>
  safe(async () => services().portfolios.listPositions(await principal(), { portfolioId: id, open: true }, page(200))),
);

export const loadOrders = cache((id: string) => safe(async () => services().orders.list(await principal(), { portfolioId: id }, page(100))));

export const loadRiskReport = cache((id: string) => safe(async () => services().risk.report(await principal(), id)));

export const loadStrategies = cache((id: string) =>
  safe(async () => services().strategies.list(await principal(), { portfolioId: id }, page(100))),
);

export const loadAgents = cache((id: string) => safe(async () => services().agents.list(await principal(), { portfolioId: id }, page(100))));

export const loadAgentRuns = cache((id: string) =>
  safe(async () => services().agents.listRuns(await principal(), { portfolioId: id }, page(10))),
);