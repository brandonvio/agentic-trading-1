/**
 * Composition root.
 *
 * `buildContainer(opts)` wires every implementation; `getContainer()` is the
 * process-wide singleton used by route handlers and server components.
 *
 * Each workstream exposes a `register*` function that binds its tokens:
 *   - lib/repositories/neo4j/index.ts      → registerNeo4jRepositories(c, client)
 *   - lib/repositories/memory/index.ts     → registerInMemoryRepositories(c)
 *   - lib/brokers/index.ts                 → registerBrokers(c)
 *   - lib/llm/index.ts                     → registerLLM(c)
 *   - lib/services/index.ts                → registerServices(c)
 */
import { Container } from "./core/container";
import { TOKENS } from "./core/tokens";
import { SystemClock } from "./core/clock";
import { RandomIdGenerator } from "./core/ids";
import { ConsoleLogger } from "./core/logger";
import { Neo4jClient, neo4jConfigFromEnv, type Neo4jConfig } from "./db/neo4j";
import { registerNeo4jRepositories } from "./repositories/neo4j";
import { registerInMemoryRepositories } from "./repositories/memory";
import { registerBrokers } from "./brokers";
import { registerLLM } from "./llm";
import { registerServices } from "./services";

export interface BuildContainerOptions {
  persistence?: "neo4j" | "memory";
  neo4j?: Partial<Neo4jConfig>;
  /** Override any registration after defaults are bound (tests). */
  configure?: (c: Container) => void;
}

export function buildContainer(opts: BuildContainerOptions = {}): Container {
  const c = new Container();
  c.registerValue(TOKENS.clock, new SystemClock());
  c.registerValue(TOKENS.ids, new RandomIdGenerator());
  c.registerValue(TOKENS.logger, new ConsoleLogger("agentic-prop"));

  const persistence = opts.persistence ?? (process.env.PERSISTENCE === "memory" ? "memory" : "neo4j");
  if (persistence === "neo4j") {
    const client = new Neo4jClient(neo4jConfigFromEnv(opts.neo4j));
    registerNeo4jRepositories(c, client);
  } else {
    registerInMemoryRepositories(c);
  }

  registerBrokers(c);
  registerLLM(c);
  registerServices(c);

  opts.configure?.(c);
  return c;
}

declare global {
  var __agenticPropContainer: Container | undefined;
}

/** Singleton for the Next.js runtime (survives HMR via globalThis). */
export function getContainer(): Container {
  if (!globalThis.__agenticPropContainer) {
    globalThis.__agenticPropContainer = buildContainer();
  }
  return globalThis.__agenticPropContainer;
}

/** Convenience accessor for services in server components / route handlers. */
export function services() {
  const c = getContainer();
  return {
    auth: c.resolve(TOKENS.authService),
    users: c.resolve(TOKENS.userService),
    desks: c.resolve(TOKENS.deskService),
    market: c.resolve(TOKENS.marketDataService),
    brokers: c.resolve(TOKENS.brokerService),
    portfolios: c.resolve(TOKENS.portfolioService),
    orders: c.resolve(TOKENS.orderService),
    risk: c.resolve(TOKENS.riskService),
    approvals: c.resolve(TOKENS.approvalService),
    strategies: c.resolve(TOKENS.strategyService),
    agents: c.resolve(TOKENS.agentService),
    signals: c.resolve(TOKENS.signalService),
    audit: c.resolve(TOKENS.auditService),
  };
}

export type Services = ReturnType<typeof services>;
