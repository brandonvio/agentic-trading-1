import "server-only";
import { cache } from "react";
import type { ZodType } from "zod";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import { AssetClass, BrokerKey } from "@/lib/domain/instrument";

/** Instruments shown per request; the quotes join is capped to the same set. */
export const INSTRUMENT_LIMIT = 120;

/** First value of a search param that may arrive repeated. */
export function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

/** Narrow a raw search param to a known enum member, or drop it. */
export function asEnum<T>(schema: ZodType<T>, value: string | string[] | undefined): T | undefined {
  const raw = first(value);
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export const ASSET_CLASS_OPTIONS = AssetClass.options.map((value) => ({ value, label: value }));
export const BROKER_OPTIONS = BrokerKey.options.map((value) => ({ value, label: value.toUpperCase() }));

export const loadMarketOverview = cache(() => safe(async () => services().market.getMarketOverview(await principal())));

export const loadInstruments = cache((assetClass?: AssetClass, broker?: BrokerKey, search?: string) =>
  safe(async () => services().market.listInstruments(await principal(), { assetClass, broker, search }, page(INSTRUMENT_LIMIT))),
);

/** `ids` is a comma-joined key so React's cache can memoise on a primitive. */
export const loadQuotes = cache((ids: string) =>
  safe(async () => (ids ? services().market.getQuotes(await principal(), ids.split(",")) : Promise.resolve([]))),
);
