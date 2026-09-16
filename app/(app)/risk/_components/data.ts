import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import type { RiskBreachSeverity, RiskBreachStatus, RiskLimitScope } from "@/lib/domain/risk";
import { page, principal } from "../../_lib/data";

/**
 * Per-request loaders for the risk desk. `cache()` keys on the arguments, so
 * the same filtered query is only executed once per render pass.
 */
export const loadFirmRisk = cache(() => safe(async () => services().risk.firmReport(await principal())));

export const loadBreaches = cache((status?: RiskBreachStatus, severity?: RiskBreachSeverity) =>
  safe(async () => services().risk.listBreaches(await principal(), { status, severity }, page(200))),
);

export const loadLimits = cache((scope?: RiskLimitScope) =>
  safe(async () => services().risk.listLimits(await principal(), { scope }, page(200))),
);

/** First value of a search param (Next gives `string | string[] | undefined`). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "" ? undefined : v;
}

/** Narrow a raw search param to one of a known set of literals. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}