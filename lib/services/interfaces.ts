/**
 * Application service contracts. Services enforce business rules and
 * authorization (given a Principal), orchestrate repositories, brokers and the
 * LLM gateway, and emit audit events. Route handlers and server components
 * only ever call services — never repositories directly.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal, User, CreateUserInput, UpdateUserInput, Role, Actor } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { Instrument, AssetClass, BrokerKey, Quote, Bar, BarInterval } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount, Position, PortfolioSnapshot } from "@/lib/domain/portfolio";
import type { Order, CreateOrderInput, OrderFilter, Fill } from "@/lib/domain/order";
import type { Strategy, CreateStrategyInput, UpdateStrategyInput, Backtest } from "@/lib/domain/strategy";
import type { Agent, CreateAgentInput, UpdateAgentInput, AgentRun, AgentStep, Signal, AgentRunTrigger, SignalStatus } from "@/lib/domain/agent";
import type { RiskLimit, CreateRiskLimitInput, UpdateRiskLimitInput, RiskBreach, RiskReport, RiskBreachStatus } from "@/lib/domain/risk";
import type { ApprovalRequest, ApprovalDecisionInput, ApprovalStatus, CreateApprovalInput } from "@/lib/domain/approval";
import type { AuditEvent, AuditFilter, CreateAuditEventInput } from "@/lib/domain/audit";
import type { BrokerCapabilities, BrokerHealth } from "@/lib/brokers/types";

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------
export interface AuthService {
  /** Mock login: resolves a user by email (no password in the mock). Records audit + lastLoginAt. */
  login(email: string, ip?: string | null): Promise<{ user: User; principal: Principal; token: string; expiresAt: number }>;
  logout(principal: Principal): Promise<void>;
  /** Resolve a session token to a Principal, or null if invalid/expired. */
  resolve(token: string | null | undefined): Promise<{ user: User; principal: Principal } | null>;
  /** Users available on the mock login screen. */
  listLoginCandidates(): Promise<Array<Pick<User, "id" | "email" | "name" | "title" | "roles" | "avatarColor">>>;
}

export interface UserService {
  get(principal: Principal, id: string): Promise<User>;
  list(principal: Principal, filter: { deskId?: string; role?: User["roles"][number] }, page: PageQuery): Promise<Paged<User>>;
  create(principal: Principal, input: CreateUserInput): Promise<User>;
  update(principal: Principal, id: string, input: UpdateUserInput): Promise<User>;
  listRoles(): Promise<Role[]>;
}

export interface DeskService {
  get(principal: Principal, id: string): Promise<Desk>;
  list(principal: Principal, page: PageQuery): Promise<Paged<Desk>>;
  /** Desk ids visible to the principal (all for global roles). */
  visibleDeskIds(principal: Principal): Promise<string[] | "all">;
}

// ---------------------------------------------------------------------------
// Market data & instruments
// ---------------------------------------------------------------------------
export interface MarketDataService {
  getInstrument(principal: Principal, id: string): Promise<Instrument>;
  listInstruments(principal: Principal, filter: { assetClass?: AssetClass; broker?: BrokerKey; search?: string }, page: PageQuery): Promise<Paged<Instrument>>;
  getQuote(principal: Principal, instrumentId: string): Promise<Quote>;
  getQuotes(principal: Principal, instrumentIds: string[]): Promise<Quote[]>;
  getBars(principal: Principal, instrumentId: string, interval: BarInterval, count: number): Promise<Bar[]>;
  /** Market-wide overview used by dashboards and the market intelligence agent. */
  getMarketOverview(principal: Principal): Promise<MarketOverview>;
}

export interface MarketOverview {
  asOf: string;
  regime: "risk_on" | "risk_off" | "neutral" | "volatile";
  headline: string;
  indicators: Array<{ name: string; value: number; changePct: number; unit: string }>;
  movers: Array<{ instrumentId: string; symbol: string; assetClass: AssetClass; last: number; changePct: number }>;
  eventCalendar: Array<{ time: string; event: string; importance: "low" | "medium" | "high" }>;
}

export interface BrokerService {
  listBrokers(principal: Principal): Promise<Array<{ capabilities: BrokerCapabilities; health: BrokerHealth; accountCount: number }>>;
  listAccounts(principal: Principal, filter: { portfolioId?: string; broker?: BrokerKey }, page: PageQuery): Promise<Paged<BrokerAccount>>;
  getAccount(principal: Principal, id: string): Promise<BrokerAccount>;
  /** Pull balances/positions from the (mock) broker and update the account row. */
  reconcileAccount(principal: Principal, id: string): Promise<BrokerAccount>;
  setAccountStatus(principal: Principal, id: string, status: BrokerAccount["status"]): Promise<BrokerAccount>;
}

// ---------------------------------------------------------------------------
// Portfolio, positions, orders
// ---------------------------------------------------------------------------
export interface PortfolioService {
  get(principal: Principal, id: string): Promise<Portfolio>;
  list(principal: Principal, filter: { deskId?: string; status?: Portfolio["status"] }, page: PageQuery): Promise<Paged<Portfolio>>;
  /** Portfolio ids visible to the principal; used by other services to scope queries. */
  visiblePortfolioIds(principal: Principal): Promise<string[] | "all">;
  snapshot(principal: Principal, id: string): Promise<PortfolioSnapshot>;
  /** Snapshot across all visible portfolios, e.g. for the firm dashboard. */
  firmSnapshot(principal: Principal): Promise<FirmSnapshot>;
  listPositions(principal: Principal, filter: { portfolioId?: string; assetClass?: AssetClass; strategyId?: string; open?: boolean }, page: PageQuery): Promise<Paged<Position>>;
  getPosition(principal: Principal, id: string): Promise<Position>;
  /** Re-mark positions with current quotes and recompute NAV. */
  markToMarket(principal: Principal, portfolioId: string): Promise<PortfolioSnapshot>;
  updateStatus(principal: Principal, id: string, status: Portfolio["status"]): Promise<Portfolio>;
}

export interface FirmSnapshot {
  asOf: string;
  totalNav: number;
  totalCash: number;
  dayPnl: number;
  unrealizedPnl: number;
  grossExposure: number;
  grossLeverage: number;
  portfolioCount: number;
  openPositionCount: number;
  exposureByAssetClass: Record<AssetClass, number>;
  exposureByDesk: Array<{ deskId: string; deskName: string; nav: number; dayPnl: number }>;
  portfolios: PortfolioSnapshot[];
}

export interface OrderService {
  get(principal: Principal, id: string): Promise<Order>;
  list(principal: Principal, filter: OrderFilter, page: PageQuery): Promise<Paged<Order>>;
  listFills(principal: Principal, orderId: string): Promise<Fill[]>;
  /**
   * Full order pipeline: validate → pre-trade risk → (approval | route) →
   * broker → fills → positions/NAV → audit. Returns the order in its resulting
   * state; risk-rejected orders are returned (status RISK_REJECTED) not thrown.
   */
  submit(principal: Principal, input: CreateOrderInput, actor?: Actor): Promise<Order>;
  /** Submit on behalf of an agent (actor is the agent). Enforces agent autonomy + mandate. */
  submitForAgent(agent: Agent, run: AgentRun, input: CreateOrderInput): Promise<Order>;
  cancel(principal: Principal, id: string, reason: string): Promise<Order>;
  /** Called by ApprovalService when an order approval is decided. */
  onApprovalDecided(orderId: string, approved: boolean, decidedBy: Actor, note: string): Promise<Order>;
  /** Close an open position with a market order (positions:close). */
  closePosition(principal: Principal, positionId: string, rationale: string): Promise<Order>;
}

// ---------------------------------------------------------------------------
// Risk & approvals
// ---------------------------------------------------------------------------
export interface PreTradeCheckContext {
  order: Order;
  portfolio: Portfolio;
  instrument: Instrument;
  actor: Actor;
  agent?: Agent | null;
}

export interface PreTradeDecision {
  outcome: "pass" | "warn" | "require_approval" | "block";
  checks: Order["riskChecks"];
  reasons: string[];
}

export interface RiskService {
  report(principal: Principal, portfolioId: string): Promise<RiskReport>;
  firmReport(principal: Principal): Promise<{ asOf: string; portfolios: RiskReport[]; openBreaches: number; criticalBreaches: number }>;
  /** Evaluate every applicable limit for a prospective order. Pure w.r.t. persistence except breach recording on block. */
  preTradeCheck(ctx: PreTradeCheckContext): Promise<PreTradeDecision>;
  /** Scan a portfolio's current state against limits, record new breaches, return them. */
  scanPortfolio(portfolioId: string, detectedBy: Actor): Promise<RiskBreach[]>;
  listLimits(principal: Principal, filter: { scope?: RiskLimit["scope"]; scopeId?: string }, page: PageQuery): Promise<Paged<RiskLimit>>;
  createLimit(principal: Principal, input: CreateRiskLimitInput): Promise<RiskLimit>;
  updateLimit(principal: Principal, id: string, input: UpdateRiskLimitInput): Promise<RiskLimit>;
  deleteLimit(principal: Principal, id: string): Promise<void>;
  listBreaches(principal: Principal, filter: { portfolioId?: string; status?: RiskBreachStatus; severity?: RiskBreach["severity"] }, page: PageQuery): Promise<Paged<RiskBreach>>;
  acknowledgeBreach(principal: Principal, id: string): Promise<RiskBreach>;
  resolveBreach(principal: Principal, id: string, note: string): Promise<RiskBreach>;
}

export interface ApprovalService {
  get(principal: Principal, id: string): Promise<ApprovalRequest>;
  list(principal: Principal, filter: { status?: ApprovalStatus; type?: ApprovalRequest["type"]; portfolioId?: string }, page: PageQuery): Promise<Paged<ApprovalRequest>>;
  request(input: CreateApprovalInput): Promise<ApprovalRequest>;
  /** Four-eyes: decider must hold approvals:decide and must not be the requester. */
  decide(principal: Principal, id: string, input: ApprovalDecisionInput): Promise<ApprovalRequest>;
  cancel(subjectId: string, reason: string): Promise<void>;
  pendingCount(principal: Principal): Promise<number>;
}

// ---------------------------------------------------------------------------
// Strategies, agents, signals
// ---------------------------------------------------------------------------
export interface StrategyService {
  get(principal: Principal, id: string): Promise<Strategy>;
  list(principal: Principal, filter: { deskId?: string; status?: Strategy["status"]; portfolioId?: string }, page: PageQuery): Promise<Paged<Strategy>>;
  create(principal: Principal, input: CreateStrategyInput): Promise<Strategy>;
  update(principal: Principal, id: string, input: UpdateStrategyInput): Promise<Strategy>;
  /** Deploy to a portfolio. Live deployments require an approval unless principal has orders:override-risk. */
  deploy(principal: Principal, id: string, portfolioId: string, allocatedCapital: number, mode: "paper" | "live"): Promise<{ strategy: Strategy; approval: ApprovalRequest | null }>;
  pause(principal: Principal, id: string, reason: string): Promise<Strategy>;
  resume(principal: Principal, id: string): Promise<Strategy>;
  runBacktest(principal: Principal, id: string, opts: { from: string; to: string; initialCapital: number }): Promise<Backtest>;
  listBacktests(principal: Principal, id: string, page: PageQuery): Promise<Paged<Backtest>>;
  getBacktest(principal: Principal, backtestId: string): Promise<Backtest>;
}

export interface AgentService {
  get(principal: Principal, id: string): Promise<Agent>;
  list(principal: Principal, filter: { kind?: Agent["kind"]; portfolioId?: string; status?: Agent["status"] }, page: PageQuery): Promise<Paged<Agent>>;
  create(principal: Principal, input: CreateAgentInput): Promise<Agent>;
  update(principal: Principal, id: string, input: UpdateAgentInput): Promise<Agent>;
  /** Start a run and execute it to completion (mock LLM is fast). Returns the finished run. */
  run(principal: Principal, id: string, opts: { objective?: string; input?: Record<string, unknown>; trigger?: AgentRunTrigger }): Promise<AgentRun>;
  kill(principal: Principal, runId: string, reason: string): Promise<AgentRun>;
  getRun(principal: Principal, runId: string): Promise<AgentRun>;
  listRuns(principal: Principal, filter: { agentId?: string; portfolioId?: string; status?: AgentRun["status"] }, page: PageQuery): Promise<Paged<AgentRun>>;
  listSteps(principal: Principal, runId: string): Promise<AgentStep[]>;
  /** Orchestrate the full agent pipeline for a portfolio: intel → signals → PM sizing → execution → risk. */
  runPortfolioCycle(principal: Principal, portfolioId: string): Promise<{ runs: AgentRun[]; signals: Signal[]; orders: Order[] }>;
  /** Aggregate usage/cost stats for dashboards. */
  usageStats(principal: Principal): Promise<AgentUsageStats>;
}

export interface AgentUsageStats {
  asOf: string;
  runsToday: number;
  runsTotal: number;
  successRatePct: number;
  inputTokens: number;
  outputTokens: number;
  costUsdToday: number;
  costUsdTotal: number;
  byKind: Array<{ kind: Agent["kind"]; runs: number; costUsd: number; signals: number; orders: number }>;
}

export interface SignalService {
  get(principal: Principal, id: string): Promise<Signal>;
  list(principal: Principal, filter: { portfolioId?: string; strategyId?: string; agentId?: string; status?: SignalStatus; instrumentId?: string }, page: PageQuery): Promise<Paged<Signal>>;
  /** Turn a signal into an order via OrderService.submit. */
  act(principal: Principal, id: string, overrides?: { quantity?: number; type?: Order["type"]; limitPrice?: number }): Promise<Order>;
  dismiss(principal: Principal, id: string, reason: string): Promise<Signal>;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export interface AuditService {
  record(input: CreateAuditEventInput): Promise<AuditEvent>;
  list(principal: Principal, filter: AuditFilter, page: PageQuery): Promise<Paged<AuditEvent>>;
}
