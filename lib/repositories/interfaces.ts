/**
 * Repository interfaces. Every persistence concern goes through one of these
 * so services can be unit-tested against in-memory implementations and run in
 * production against Neo4j. Implementations must be thin: no business rules.
 *
 * Conventions
 *  - `create` accepts a fully-formed entity (ids/timestamps assigned by the
 *    service layer via IdGenerator/Clock) and persists it as-is.
 *  - `update` performs a partial merge and returns the updated entity.
 *  - list methods accept a filter object plus PageQuery and return Paged<T>.
 *  - Missing entities resolve to `null` from find*, and throw NotFoundError from update/delete.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { User, Role, RoleKey } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { Instrument, AssetClass, BrokerKey, Bar, BarInterval } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount, Position } from "@/lib/domain/portfolio";
import type { Order, OrderFilter, Fill } from "@/lib/domain/order";
import type { Strategy, Backtest } from "@/lib/domain/strategy";
import type { Agent, AgentRun, AgentStep, Signal, AgentRunStatus, SignalStatus } from "@/lib/domain/agent";
import type { RiskLimit, RiskBreach, RiskBreachStatus } from "@/lib/domain/risk";
import type { ApprovalRequest, ApprovalStatus } from "@/lib/domain/approval";
import type { AuditEvent, AuditFilter } from "@/lib/domain/audit";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(filter: { deskId?: string; role?: RoleKey; status?: User["status"] }, page: PageQuery): Promise<Paged<User>>;
  create(user: User): Promise<User>;
  update(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User>;
  delete(id: string): Promise<void>;
}

export interface RoleRepository {
  findByKey(key: RoleKey): Promise<Role | null>;
  list(): Promise<Role[]>;
  upsert(role: Role): Promise<Role>;
}

export interface DeskRepository {
  findById(id: string): Promise<Desk | null>;
  findByCode(code: string): Promise<Desk | null>;
  list(page: PageQuery): Promise<Paged<Desk>>;
  listByIds(ids: string[]): Promise<Desk[]>;
  create(desk: Desk): Promise<Desk>;
  update(id: string, patch: Partial<Omit<Desk, "id" | "createdAt">>): Promise<Desk>;
}

export interface InstrumentRepository {
  findById(id: string): Promise<Instrument | null>;
  findBySymbol(symbol: string): Promise<Instrument | null>;
  listByIds(ids: string[]): Promise<Instrument[]>;
  list(
    filter: { assetClass?: AssetClass; broker?: BrokerKey; search?: string; tradable?: boolean },
    page: PageQuery,
  ): Promise<Paged<Instrument>>;
  create(instrument: Instrument): Promise<Instrument>;
  createMany(instruments: Instrument[]): Promise<number>;
  update(id: string, patch: Partial<Omit<Instrument, "id" | "createdAt">>): Promise<Instrument>;
}

export interface BarRepository {
  /** Returns bars ascending by time. */
  list(instrumentId: string, interval: BarInterval, opts: { from?: string; to?: string; limit?: number }): Promise<Bar[]>;
  createMany(interval: BarInterval, bars: Bar[]): Promise<number>;
}

export interface PortfolioRepository {
  findById(id: string): Promise<Portfolio | null>;
  findByCode(code: string): Promise<Portfolio | null>;
  list(filter: { deskId?: string; deskIds?: string[]; status?: Portfolio["status"]; managerUserId?: string }, page: PageQuery): Promise<Paged<Portfolio>>;
  create(portfolio: Portfolio): Promise<Portfolio>;
  update(id: string, patch: Partial<Omit<Portfolio, "id" | "createdAt">>): Promise<Portfolio>;
}

export interface BrokerAccountRepository {
  findById(id: string): Promise<BrokerAccount | null>;
  findByPortfolioAndBroker(portfolioId: string, broker: BrokerKey): Promise<BrokerAccount | null>;
  list(filter: { portfolioId?: string; broker?: BrokerKey; status?: BrokerAccount["status"] }, page: PageQuery): Promise<Paged<BrokerAccount>>;
  create(account: BrokerAccount): Promise<BrokerAccount>;
  update(id: string, patch: Partial<Omit<BrokerAccount, "id" | "createdAt">>): Promise<BrokerAccount>;
}

export interface PositionRepository {
  findById(id: string): Promise<Position | null>;
  findOpen(portfolioId: string, instrumentId: string): Promise<Position | null>;
  list(
    filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; strategyId?: string; assetClass?: AssetClass; open?: boolean },
    page: PageQuery,
  ): Promise<Paged<Position>>;
  create(position: Position): Promise<Position>;
  update(id: string, patch: Partial<Omit<Position, "id" | "createdAt">>): Promise<Position>;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  list(filter: OrderFilter & { portfolioIds?: string[]; createdByActorId?: string }, page: PageQuery): Promise<Paged<Order>>;
  create(order: Order): Promise<Order>;
  update(id: string, patch: Partial<Omit<Order, "id" | "createdAt">>): Promise<Order>;
  /** Sum of estimatedNotional for agent-originated orders in a portfolio since `sinceIso`. */
  sumAgentNotionalSince(portfolioId: string, sinceIso: string): Promise<number>;
  countByStatus(portfolioId: string, statuses: Order["status"][]): Promise<number>;
}

export interface FillRepository {
  listByOrder(orderId: string): Promise<Fill[]>;
  list(filter: { portfolioId?: string; portfolioIds?: string[]; instrumentId?: string; from?: string; to?: string }, page: PageQuery): Promise<Paged<Fill>>;
  create(fill: Fill): Promise<Fill>;
}

export interface StrategyRepository {
  findById(id: string): Promise<Strategy | null>;
  findByCode(code: string): Promise<Strategy | null>;
  list(filter: { deskId?: string; deskIds?: string[]; status?: Strategy["status"]; portfolioId?: string; ownerUserId?: string }, page: PageQuery): Promise<Paged<Strategy>>;
  create(strategy: Strategy): Promise<Strategy>;
  update(id: string, patch: Partial<Omit<Strategy, "id" | "createdAt">>): Promise<Strategy>;
}

export interface BacktestRepository {
  findById(id: string): Promise<Backtest | null>;
  listByStrategy(strategyId: string, page: PageQuery): Promise<Paged<Backtest>>;
  create(backtest: Backtest): Promise<Backtest>;
  update(id: string, patch: Partial<Omit<Backtest, "id" | "createdAt">>): Promise<Backtest>;
}

export interface AgentRepository {
  findById(id: string): Promise<Agent | null>;
  list(filter: { kind?: Agent["kind"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; status?: Agent["status"]; includeGlobal?: boolean }, page: PageQuery): Promise<Paged<Agent>>;
  create(agent: Agent): Promise<Agent>;
  update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent>;
}

export interface AgentRunRepository {
  findById(id: string): Promise<AgentRun | null>;
  list(filter: { agentId?: string; portfolioId?: string; portfolioIds?: string[]; status?: AgentRunStatus; includeGlobal?: boolean }, page: PageQuery): Promise<Paged<AgentRun>>;
  create(run: AgentRun): Promise<AgentRun>;
  update(id: string, patch: Partial<Omit<AgentRun, "id">>): Promise<AgentRun>;
  listSteps(runId: string): Promise<AgentStep[]>;
  appendStep(step: AgentStep): Promise<AgentStep>;
}

export interface SignalRepository {
  findById(id: string): Promise<Signal | null>;
  list(filter: { portfolioId?: string; portfolioIds?: string[]; strategyId?: string; agentId?: string; runId?: string; instrumentId?: string; status?: SignalStatus }, page: PageQuery): Promise<Paged<Signal>>;
  create(signal: Signal): Promise<Signal>;
  update(id: string, patch: Partial<Omit<Signal, "id" | "createdAt">>): Promise<Signal>;
}

export interface RiskLimitRepository {
  findById(id: string): Promise<RiskLimit | null>;
  /** All enabled limits applicable to a portfolio: platform + its desk + the portfolio + optional strategy/agent. */
  listApplicable(scope: { portfolioId: string; deskId: string; strategyId?: string | null; agentId?: string | null }): Promise<RiskLimit[]>;
  list(filter: { scope?: RiskLimit["scope"]; scopeId?: string; enabled?: boolean }, page: PageQuery): Promise<Paged<RiskLimit>>;
  create(limit: RiskLimit): Promise<RiskLimit>;
  update(id: string, patch: Partial<Omit<RiskLimit, "id" | "createdAt">>): Promise<RiskLimit>;
  delete(id: string): Promise<void>;
}

export interface RiskBreachRepository {
  findById(id: string): Promise<RiskBreach | null>;
  list(filter: { portfolioId?: string; portfolioIds?: string[]; status?: RiskBreachStatus; severity?: RiskBreach["severity"]; limitId?: string }, page: PageQuery): Promise<Paged<RiskBreach>>;
  create(breach: RiskBreach): Promise<RiskBreach>;
  update(id: string, patch: Partial<Omit<RiskBreach, "id">>): Promise<RiskBreach>;
}

export interface ApprovalRepository {
  findById(id: string): Promise<ApprovalRequest | null>;
  findPendingBySubject(subjectId: string): Promise<ApprovalRequest | null>;
  list(filter: { status?: ApprovalStatus; type?: ApprovalRequest["type"]; portfolioId?: string; portfolioIds?: string[]; deskId?: string; requestedById?: string }, page: PageQuery): Promise<Paged<ApprovalRequest>>;
  create(approval: ApprovalRequest): Promise<ApprovalRequest>;
  update(id: string, patch: Partial<Omit<ApprovalRequest, "id" | "createdAt">>): Promise<ApprovalRequest>;
}

export interface AuditRepository {
  list(filter: AuditFilter & { portfolioIds?: string[] }, page: PageQuery): Promise<Paged<AuditEvent>>;
  create(event: AuditEvent): Promise<AuditEvent>;
  createMany(events: AuditEvent[]): Promise<number>;
}

/** Aggregate of all repositories, injected as a unit into services. */
export interface Repositories {
  users: UserRepository;
  roles: RoleRepository;
  desks: DeskRepository;
  instruments: InstrumentRepository;
  bars: BarRepository;
  portfolios: PortfolioRepository;
  brokerAccounts: BrokerAccountRepository;
  positions: PositionRepository;
  orders: OrderRepository;
  fills: FillRepository;
  strategies: StrategyRepository;
  backtests: BacktestRepository;
  agents: AgentRepository;
  agentRuns: AgentRunRepository;
  signals: SignalRepository;
  riskLimits: RiskLimitRepository;
  riskBreaches: RiskBreachRepository;
  approvals: ApprovalRepository;
  audit: AuditRepository;
}

/** Optional lifecycle hooks a repository set may expose (schema setup, wipe for tests/seed). */
export interface RepositoryAdmin {
  ensureSchema(): Promise<void>;
  clearAll(): Promise<void>;
  close(): Promise<void>;
}
