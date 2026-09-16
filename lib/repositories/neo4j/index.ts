/**
 * Neo4j repository set. `registerNeo4jRepositories` binds TOKENS.repos and
 * TOKENS.repoAdmin; `createNeo4jRepositories` builds the set for direct use
 * (scripts, integration tests).
 */
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { SystemClock, type Clock } from "@/lib/core/clock";
import type { Neo4jClient } from "@/lib/db/neo4j";
import { clearDatabase, ensureSchema } from "@/lib/db/schema";
import type { Repositories, RepositoryAdmin } from "../interfaces";
import type { RepoContext } from "./crud";
import { Neo4jUserRepository } from "./users";
import { Neo4jRoleRepository } from "./roles";
import { Neo4jDeskRepository } from "./desks";
import { Neo4jInstrumentRepository } from "./instruments";
import { Neo4jBarRepository } from "./bars";
import { Neo4jPortfolioRepository } from "./portfolios";
import { Neo4jBrokerAccountRepository } from "./broker-accounts";
import { Neo4jPositionRepository } from "./positions";
import { Neo4jOrderRepository } from "./orders";
import { Neo4jFillRepository } from "./fills";
import { Neo4jStrategyRepository } from "./strategies";
import { Neo4jBacktestRepository } from "./backtests";
import { Neo4jAgentRepository } from "./agents";
import { Neo4jAgentRunRepository } from "./agent-runs";
import { Neo4jSignalRepository } from "./signals";
import { Neo4jRiskLimitRepository } from "./risk-limits";
import { Neo4jRiskBreachRepository } from "./risk-breaches";
import { Neo4jApprovalRepository } from "./approvals";
import { Neo4jAuditRepository } from "./audit";

export interface Neo4jRepositoryOptions {
  /** Time source for `updatedAt` on patches that omit it (defaults to SystemClock). */
  clock?: Clock;
}

export function createNeo4jRepositories(client: Neo4jClient, opts: Neo4jRepositoryOptions = {}): Repositories {
  const clock = opts.clock ?? new SystemClock();
  const ctx: RepoContext = { client, now: () => clock.nowIso() };
  return {
    users: new Neo4jUserRepository(ctx),
    roles: new Neo4jRoleRepository(ctx),
    desks: new Neo4jDeskRepository(ctx),
    instruments: new Neo4jInstrumentRepository(ctx),
    bars: new Neo4jBarRepository(ctx),
    portfolios: new Neo4jPortfolioRepository(ctx),
    brokerAccounts: new Neo4jBrokerAccountRepository(ctx),
    positions: new Neo4jPositionRepository(ctx),
    orders: new Neo4jOrderRepository(ctx),
    fills: new Neo4jFillRepository(ctx),
    strategies: new Neo4jStrategyRepository(ctx),
    backtests: new Neo4jBacktestRepository(ctx),
    agents: new Neo4jAgentRepository(ctx),
    agentRuns: new Neo4jAgentRunRepository(ctx),
    signals: new Neo4jSignalRepository(ctx),
    riskLimits: new Neo4jRiskLimitRepository(ctx),
    riskBreaches: new Neo4jRiskBreachRepository(ctx),
    approvals: new Neo4jApprovalRepository(ctx),
    audit: new Neo4jAuditRepository(ctx),
  };
}

export function createNeo4jRepositoryAdmin(client: Neo4jClient): RepositoryAdmin {
  return {
    async ensureSchema() {
      await ensureSchema(client);
    },
    clearAll: () => clearDatabase(client),
    close: () => client.close(),
  };
}

export function registerNeo4jRepositories(c: Container, client: Neo4jClient): void {
  c.register(TOKENS.repos, (container) =>
    createNeo4jRepositories(client, { clock: container.has(TOKENS.clock) ? container.resolve(TOKENS.clock) : undefined }),
  );
  c.registerValue(TOKENS.repoAdmin, createNeo4jRepositoryAdmin(client));
}

export {
  Neo4jUserRepository,
  Neo4jRoleRepository,
  Neo4jDeskRepository,
  Neo4jInstrumentRepository,
  Neo4jBarRepository,
  Neo4jPortfolioRepository,
  Neo4jBrokerAccountRepository,
  Neo4jPositionRepository,
  Neo4jOrderRepository,
  Neo4jFillRepository,
  Neo4jStrategyRepository,
  Neo4jBacktestRepository,
  Neo4jAgentRepository,
  Neo4jAgentRunRepository,
  Neo4jSignalRepository,
  Neo4jRiskLimitRepository,
  Neo4jRiskBreachRepository,
  Neo4jApprovalRepository,
  Neo4jAuditRepository,
};
