/**
 * Agent layer composition root.
 *
 * `registerAgentServices(c)` binds `TOKENS.agentService` and
 * `TOKENS.signalService`. Peer application services are resolved lazily
 * through a `ServicesAccessor` closure, so this module can be registered in
 * any order relative to `registerServices` and no import cycle forms with the
 * service composition root.
 */
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { PortfolioScope } from "@/lib/services/authz";
import type { ServicesAccessor } from "./services";
import { createToolRegistry } from "./tools";
import type { ToolRegistry } from "./tools/registry";
import { AgentRuntime, KillSwitch } from "./runtime";
import { PortfolioCycleOrchestrator } from "./orchestrator";
import { AgentServiceImpl } from "./agent.service";
import { SignalServiceImpl } from "./signal.service";

/** Everything the agent layer builds for one container, wired once. */
export interface AgentStack {
  registry: ToolRegistry;
  killSwitch: KillSwitch;
  runtime: AgentRuntime;
  orchestrator: PortfolioCycleOrchestrator;
  agents: AgentServiceImpl;
  signals: SignalServiceImpl;
}

const stacks = new WeakMap<Container, AgentStack>();

/** Build (and memoise) the agent stack for a container. */
export function agentStackOf(c: Container): AgentStack {
  const cached = stacks.get(c);
  if (cached) return cached;

  const repos = c.resolve(TOKENS.repos);
  const clock = c.resolve(TOKENS.clock);
  const ids = c.resolve(TOKENS.ids);
  const logger = c.resolve(TOKENS.logger);
  const scope = new PortfolioScope(repos.portfolios);

  // Resolved at call time: keeps registration order irrelevant and lets
  // OrderService ⇄ AgentService style cycles settle on first use.
  const services: ServicesAccessor = () => ({
    market: c.resolve(TOKENS.marketDataService),
    portfolios: c.resolve(TOKENS.portfolioService),
    orders: c.resolve(TOKENS.orderService),
    risk: c.resolve(TOKENS.riskService),
    strategies: c.resolve(TOKENS.strategyService),
    approvals: c.resolve(TOKENS.approvalService),
    audit: c.resolve(TOKENS.auditService),
  });

  const registry = createToolRegistry();
  const killSwitch = new KillSwitch();
  const runtime = new AgentRuntime({ repos, services, llm: c.resolve(TOKENS.llm), registry, clock, ids, logger, killSwitch });
  const orchestrator = new PortfolioCycleOrchestrator(repos, scope, services, runtime, logger);
  const stack: AgentStack = {
    registry,
    killSwitch,
    runtime,
    orchestrator,
    agents: new AgentServiceImpl(repos, scope, services, runtime, orchestrator, registry, killSwitch, clock, ids, logger),
    signals: new SignalServiceImpl(repos, scope, services, clock, logger),
  };
  stacks.set(c, stack);
  return stack;
}

/**
 * Bind the agent and signal services. Requires TOKENS.repos, TOKENS.llm,
 * TOKENS.clock, TOKENS.ids and TOKENS.logger to be registered first; peer
 * application services may be registered before or after.
 */
export function registerAgentServices(c: Container): void {
  c.register(TOKENS.agentService, (cc) => agentStackOf(cc).agents);
  c.register(TOKENS.signalService, (cc) => agentStackOf(cc).signals);
}

export { AgentRuntime, KillSwitch, buildAgentPrincipal } from "./runtime";
export type { AgentRuntimeDeps, StartRunInput } from "./runtime";
export { PortfolioCycleOrchestrator } from "./orchestrator";
export type { PortfolioCycleResult } from "./orchestrator";
export { AgentServiceImpl } from "./agent.service";
export { SignalServiceImpl } from "./signal.service";
export { AGENT_BLUEPRINTS, AGENT_KINDS, blueprintFor, defaultObjectiveFor } from "./definitions";
export type { AgentBlueprint } from "./definitions";
export { createToolRegistry, ALL_TOOLS, ALL_TOOL_NAMES, ToolRegistry, defineTool, zodToJsonSchema } from "./tools";
export type { ToolContext, ToolDefinition, ToolInvocationResult } from "./tools";
export type { AgentServices, ServicesAccessor } from "./services";
