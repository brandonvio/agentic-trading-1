import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import { PortfolioStatus } from "@/lib/domain/portfolio";

/** First value of a search param, or undefined when absent/empty. */
export function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

/** Unknown status values are dropped rather than passed to the service. */
export function parseStatus(value: string | undefined) {
  return value ? PortfolioStatus.safeParse(value).data : undefined;
}

export const loadPortfolios = cache((deskId?: string, status?: string) =>
  safe(async () => services().portfolios.list(await principal(), { deskId, status: parseStatus(status) }, page(500))),
);

export const loadFirmSnapshot = cache(() => safe(async () => services().portfolios.firmSnapshot(await principal())));