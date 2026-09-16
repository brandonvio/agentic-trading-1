import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import { AssetClass } from "@/lib/domain/instrument";
import type { Strategy } from "@/lib/domain/strategy";

/** First value of a search param, or undefined when absent/empty. */
export function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

/** `?open=true|false`; anything else means "no filter". */
export function parseOpen(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export const loadPositions = cache((portfolioId?: string, assetClass?: string, open?: string) =>
  safe(async () =>
    services().portfolios.listPositions(
      await principal(),
      { portfolioId, assetClass: assetClass ? AssetClass.safeParse(assetClass).data : undefined, open: parseOpen(open) },
      page(500),
    ),
  ),
);

/** Strategy codes for the strategy column; empty when the role cannot read strategies. */
export const loadStrategyIndex = cache(async (): Promise<Map<string, Strategy>> => {
  const r = await safe(async () => services().strategies.list(await principal(), {}, page(500)));
  return new Map(r.ok ? r.value.items.map((s) => [s.id, s]) : []);
});