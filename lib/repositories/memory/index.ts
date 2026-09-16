/**
 * In-memory repository set. Used for unit tests and `PERSISTENCE=memory`
 * runs; behaviour mirrors the Neo4j implementation (ordering, filters,
 * NotFoundError on update/delete of unknown ids).
 */
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import type { Repositories, RepositoryAdmin } from "@/lib/repositories/interfaces";
import type { User, Role } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { Instrument, Bar } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount, Position } from "@/lib/domain/portfolio";
import type { Order, Fill } from "@/lib/domain/order";
import type { Strategy, Backtest } from "@/lib/domain/strategy";
import type { Agent, AgentRun, AgentStep, Signal } from "@/lib/domain/agent";
import type { RiskLimit, RiskBreach } from "@/lib/domain/risk";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { AuditEvent } from "@/lib/domain/audit";
import { MemoryTable } from "./table";
import { InMemoryUserRepository, InMemoryRoleRepository, InMemoryDeskRepository } from "./org";
import { InMemoryInstrumentRepository, InMemoryBarRepository } from "./market";
import { InMemoryPortfolioRepository, InMemoryBrokerAccountRepository, InMemoryPositionRepository } from "./portfolio";
import { InMemoryOrderRepository, InMemoryFillRepository } from "./order";
import { InMemoryStrategyRepository, InMemoryBacktestRepository } from "./strategy";
import { InMemoryAgentRepository, InMemoryAgentRunRepository, InMemorySignalRepository } from "./agent";
import { InMemoryRiskLimitRepository, InMemoryRiskBreachRepository } from "./risk";
import { InMemoryApprovalRepository } from "./approval";
import { InMemoryAuditRepository } from "./audit";

export type InMemoryRepositories = Repositories & { admin: RepositoryAdmin };

export function createInMemoryRepositories(): InMemoryRepositories {
  const users = new MemoryTable<User>("User");
  const roles = new MemoryTable<Role>("Role");
  const desks = new MemoryTable<Desk>("Desk");
  const instruments = new MemoryTable<Instrument>("Instrument");
  const bars = new Map<string, Map<string, Bar>>();
  const portfolios = new MemoryTable<Portfolio>("Portfolio");
  const brokerAccounts = new MemoryTable<BrokerAccount>("BrokerAccount");
  const positions = new MemoryTable<Position>("Position");
  const orders = new MemoryTable<Order>("Order");
  const fills = new MemoryTable<Fill>("Fill");
  const strategies = new MemoryTable<Strategy>("Strategy");
  const backtests = new MemoryTable<Backtest>("Backtest");
  const agents = new MemoryTable<Agent>("Agent");
  const agentRuns = new MemoryTable<AgentRun>("AgentRun");
  const agentSteps = new Map<string, AgentStep[]>();
  const signals = new MemoryTable<Signal>("Signal");
  const riskLimits = new MemoryTable<RiskLimit>("RiskLimit");
  const riskBreaches = new MemoryTable<RiskBreach>("RiskBreach");
  const approvals = new MemoryTable<ApprovalRequest>("ApprovalRequest");
  const audit = new MemoryTable<AuditEvent>("AuditEvent");

  const tables = [users, roles, desks, instruments, portfolios, brokerAccounts, positions, orders, fills, strategies, backtests, agents, agentRuns, signals, riskLimits, riskBreaches, approvals, audit];

  const admin: RepositoryAdmin = {
    async ensureSchema() {
      /* no schema for in-memory storage */
    },
    async clearAll() {
      for (const t of tables) t.clear();
      bars.clear();
      agentSteps.clear();
    },
    async close() {
      /* nothing to release */
    },
  };

  return {
    users: new InMemoryUserRepository(users),
    roles: new InMemoryRoleRepository(roles),
    desks: new InMemoryDeskRepository(desks),
    instruments: new InMemoryInstrumentRepository(instruments),
    bars: new InMemoryBarRepository(bars),
    portfolios: new InMemoryPortfolioRepository(portfolios),
    brokerAccounts: new InMemoryBrokerAccountRepository(brokerAccounts),
    positions: new InMemoryPositionRepository(positions),
    orders: new InMemoryOrderRepository(orders, portfolios),
    fills: new InMemoryFillRepository(fills),
    strategies: new InMemoryStrategyRepository(strategies),
    backtests: new InMemoryBacktestRepository(backtests),
    agents: new InMemoryAgentRepository(agents),
    agentRuns: new InMemoryAgentRunRepository(agentRuns, agentSteps),
    signals: new InMemorySignalRepository(signals),
    riskLimits: new InMemoryRiskLimitRepository(riskLimits),
    riskBreaches: new InMemoryRiskBreachRepository(riskBreaches),
    approvals: new InMemoryApprovalRepository(approvals),
    audit: new InMemoryAuditRepository(audit),
    admin,
  };
}

/** Bind TOKENS.repos and TOKENS.repoAdmin to a fresh in-memory repository set. */
export function registerInMemoryRepositories(c: Container): void {
  const repos = createInMemoryRepositories();
  c.registerValue(TOKENS.repos, repos);
  c.registerValue(TOKENS.repoAdmin, repos.admin);
}
