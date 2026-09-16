import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import type { Agent, SignalStatus } from "@/lib/domain/agent";
import type { Strategy } from "@/lib/domain/strategy";

export interface SignalFilter {
  portfolioId?: string;
  strategyId?: string;
  agentId?: string;
  status?: SignalStatus;
  instrumentId?: string;
}

/**
 * Per-request signal loaders. The agent and strategy indexes are `cache()`d
 * lookups shared by the table and the detail page; both degrade to an empty
 * Map so a role without `agents:read` still sees the signals it may read.
 */
export const loadSignals = cache((filter: SignalFilter, limit = 200) =>
  safe(async () => services().signals.list(await principal(), filter, page(limit))),
);

export const loadSignal = cache((id: string) => safe(async () => services().signals.get(await principal(), id)));

export const loadRun = cache((runId: string) => safe(async () => services().agents.getRun(await principal(), runId)));

export const loadAgentIndex = cache(async (): Promise<Map<string, Agent>> => {
  const r = await safe(async () => services().agents.list(await principal(), {}, page(200)));
  return new Map(r.ok ? r.value.items.map((a) => [a.id, a]) : []);
});

export const loadStrategyIndex = cache(async (): Promise<Map<string, Strategy>> => {
  const r = await safe(async () => services().strategies.list(await principal(), {}, page(200)));
  return new Map(r.ok ? r.value.items.map((s) => [s.id, s]) : []);
});

/** Orders on the signal's instrument; the caller narrows to `order.signalId`. */
export const loadOrdersForInstrument = cache((instrumentId: string) =>
  safe(async () => services().orders.list(await principal(), { instrumentId }, page(200))),
);