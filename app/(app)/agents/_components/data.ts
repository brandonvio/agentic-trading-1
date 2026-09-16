import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { page, principal } from "@/app/(app)/_lib/data";
import { AgentKind, AgentStatus } from "@/lib/domain/agent";

/** Per-request loaders for the agents index. Primitive args so `cache()` hits. */
export const loadAgents = cache((kind?: AgentKind, status?: AgentStatus, portfolioId?: string) =>
  safe(async () => services().agents.list(await principal(), { kind, status, portfolioId }, page(200))),
);

export const loadAgentUsage = cache(() => safe(async () => services().agents.usageStats(await principal())));

/** First value of a searchParam, narrowed to a known enum member. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export function asKind(value: string | undefined): AgentKind | undefined {
  return value && (AgentKind.options as readonly string[]).includes(value) ? (value as AgentKind) : undefined;
}

export function asStatus(value: string | undefined): AgentStatus | undefined {
  return value && (AgentStatus.options as readonly string[]).includes(value) ? (value as AgentStatus) : undefined;
}