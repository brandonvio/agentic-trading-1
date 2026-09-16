/**
 * Builds the Agent entities from the declarative roster in agent-roster.ts.
 */
import type { Agent } from "@/lib/domain/agent";
import { ID_PREFIX } from "@/lib/core/ids";
import type { SeedContext } from "../context";
import type { OrgBundle } from "./org";
import type { PortfolioBundle } from "./portfolios";
import type { StrategyBundle } from "./strategies";
import { AGENT_SPECS, MODEL_BY_KIND, TOOLS_BY_KIND, type AgentKey } from "./agent-roster";

export type { AgentKey };

export interface AgentBundle {
  agents: Agent[];
  agentByKey: (key: AgentKey) => Agent;
  /** Spec metadata kept alongside the entity for run generation. */
  keyOf: (agentId: string) => AgentKey;
}

export function generateAgents(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  strategies: StrategyBundle,
): AgentBundle {
  const keyById = new Map<string, AgentKey>();
  const byKey = new Map<AgentKey, Agent>();
  const agents: Agent[] = AGENT_SPECS.map((spec) => {
    const createdAt = ctx.daysAgo(spec.createdDaysAgo);
    const agent: Agent = {
      id: ctx.ids.next(ID_PREFIX.agent),
      kind: spec.kind,
      name: spec.name,
      description: spec.description,
      status: spec.status,
      autonomy: spec.autonomy,
      model: MODEL_BY_KIND[spec.kind],
      portfolioId: spec.portfolio ? portfolios.portfolioByCode(spec.portfolio).id : null,
      deskId: spec.desk ? org.deskByCode(spec.desk).id : null,
      strategyIds: spec.strategies.map((code) => strategies.strategyByCode(code).id),
      tools: [...TOOLS_BY_KIND[spec.kind]],
      schedule: {
        description: spec.scheduleDescription,
        intervalMinutes: spec.intervalMinutes,
        enabled: spec.scheduleEnabled,
      },
      guardrails: [...spec.guardrails],
      maxStepsPerRun: spec.maxStepsPerRun,
      maxNotionalPerRun: spec.maxNotionalPerRun,
      ownerUserId: org.userByEmail(spec.ownerEmail).id,
      lastRunAt: null,
      lastRunId: null,
      createdAt,
      updatedAt: ctx.daysAgo(ctx.rng.range(0.5, 14)),
    };
    keyById.set(agent.id, spec.key);
    byKey.set(spec.key, agent);
    return agent;
  });

  const agentByKey = (key: AgentKey): Agent => {
    const a = byKey.get(key);
    if (!a) throw new Error(`Seed generation error: unknown agent key ${key}`);
    return a;
  };
  const keyOf = (agentId: string): AgentKey => {
    const k = keyById.get(agentId);
    if (!k) throw new Error(`Seed generation error: unknown agent id ${agentId}`);
    return k;
  };

  return { agents, agentByKey, keyOf };
}
