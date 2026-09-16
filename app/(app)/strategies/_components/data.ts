import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import { StrategyStatus, StrategyStyle } from "@/lib/domain/strategy";

/** Style is not a service-side filter, so it is applied in the table component. */
export const loadStrategies = cache((status?: StrategyStatus, deskId?: string) =>
  safe(async () => services().strategies.list(await principal(), { status, deskId }, page(200))),
);

export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export function asStrategyStatus(value: string | undefined): StrategyStatus | undefined {
  return value && (StrategyStatus.options as readonly string[]).includes(value) ? (value as StrategyStatus) : undefined;
}

export function asStrategyStyle(value: string | undefined): StrategyStyle | undefined {
  return value && (StrategyStyle.options as readonly string[]).includes(value) ? (value as StrategyStyle) : undefined;
}