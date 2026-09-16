/**
 * Deterministic entity builders for tests. Every builder returns a fully valid
 * entity (parsed through its zod schema) and accepts partial overrides.
 * Ids come from a SequentialIdGenerator; timestamps are fixed ISO strings.
 */
import { ID_PREFIX, SequentialIdGenerator } from "@/lib/core/ids";
import { Role, User, type Actor } from "@/lib/domain/auth";
import { Desk } from "@/lib/domain/org";
import { ASSET_CLASS_BROKER, Bar, Instrument, type AssetClass, type InstrumentDetails } from "@/lib/domain/instrument";
import { BrokerAccount, Portfolio, Position } from "@/lib/domain/portfolio";
import { Fill, Order } from "@/lib/domain/order";
import { Backtest, Strategy } from "@/lib/domain/strategy";
import { Agent, AgentRun, AgentStep, Signal } from "@/lib/domain/agent";
import { RiskBreach, RiskLimit } from "@/lib/domain/risk";
import { ApprovalRequest } from "@/lib/domain/approval";
import { AuditEvent } from "@/lib/domain/audit";
import { ROLE_CATALOG } from "@/lib/auth/permissions";

export const T0 = "2026-09-01T10:00:00.000Z";
export const T0_MS = Date.parse(T0);

/** ISO timestamp `minutes` after T0. */
export function at(minutes: number): string {
  return new Date(T0_MS + minutes * 60_000).toISOString();
}

let ids = new SequentialIdGenerator("fx");

export function resetFixtureIds(tag = "fx"): void {
  ids = new SequentialIdGenerator(tag);
}

export function nextId(prefix: string): string {
  return ids.next(prefix);
}

export const USER_ACTOR: Actor = { kind: "user", id: "usr_fx0001", name: "Fixture User" };
export const AGENT_ACTOR: Actor = { kind: "agent", id: "agt_fx0001", name: "Fixture Agent", runId: "run_fx0001" };
export const SYSTEM: Actor = { kind: "system", id: "system", name: "system" };

const stamps = { createdAt: T0, updatedAt: T0 };

export function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId(ID_PREFIX.user);
  return User.parse({
    id,
    email: `${id}@example.com`,
    name: `User ${id}`,
    title: "Trader",
    status: "active",
    roles: ["trader"],
    deskIds: [],
    avatarColor: "#2563eb",
    lastLoginAt: null,
    ...stamps,
    ...overrides,
  });
}

export function makeRole(overrides: Partial<Role> = {}): Role {
  return Role.parse({
    id: nextId(ID_PREFIX.role),
    key: "trader",
    name: "Trader",
    description: "Executes orders",
    permissions: ["orders:read", "orders:create", "portfolios:read"],
    ...overrides,
  });
}

export function makeDesk(overrides: Partial<Desk> = {}): Desk {
  const id = overrides.id ?? nextId(ID_PREFIX.desk);
  return Desk.parse({
    id,
    code: overrides.code ?? id.toUpperCase(),
    name: `Desk ${id}`,
    focus: "multi_strategy",
    baseCurrency: "USD",
    capitalAllocation: 50_000_000,
    headUserId: null,
    ...stamps,
    ...overrides,
  });
}

export function makeInstrumentDetails(assetClass: AssetClass): InstrumentDetails {
  switch (assetClass) {
    case "equity":
      return { assetClass, exchange: "NASDAQ", sector: "Technology" };
    case "option":
      return { assetClass, underlyingSymbol: "SPY", strike: 560, expiry: "2026-09-18", right: "CALL", multiplier: 100 };
    case "future":
      return { assetClass, rootSymbol: "ES", expiry: "2026-12-18", multiplier: 50, tickSize: 0.25 };
    case "forex":
      return { assetClass, baseCurrency: "EUR", quoteCurrency: "USD", pipSize: 0.0001 };
    case "crypto":
      return { assetClass, baseAsset: "BTC", quoteAsset: "USD" };
    case "event":
      return { assetClass, question: "Will the Fed cut rates in December 2026?", closeTime: "2026-12-16T19:00:00.000Z", settlementValue: 1 };
  }
}

export function makeInstrument(overrides: Partial<Instrument> = {}): Instrument {
  const id = overrides.id ?? nextId(ID_PREFIX.instrument);
  const assetClass = overrides.assetClass ?? "equity";
  return Instrument.parse({
    id,
    symbol: overrides.symbol ?? id.toUpperCase(),
    name: `Instrument ${id}`,
    assetClass,
    broker: ASSET_CLASS_BROKER[assetClass],
    venue: "SMART",
    currency: "USD",
    multiplier: 1,
    tickSize: 0.01,
    lotSize: 1,
    tradable: true,
    details: makeInstrumentDetails(assetClass),
    ...stamps,
    ...overrides,
  });
}

export function makeBar(overrides: Partial<Bar> = {}): Bar {
  return Bar.parse({
    instrumentId: "ins_fx0001",
    time: T0,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1_000,
    ...overrides,
  });
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  const id = overrides.id ?? nextId(ID_PREFIX.portfolio);
  return Portfolio.parse({
    id,
    deskId: "desk_fx0001",
    code: overrides.code ?? id.toUpperCase(),
    name: `Portfolio ${id}`,
    description: "Fixture portfolio",
    baseCurrency: "USD",
    status: "active",
    managerUserId: "usr_fx0001",
    nav: 10_000_000,
    navAsOf: T0,
    inceptionCapital: 10_000_000,
    cash: 2_500_000,
    mandate: {
      assetClasses: ["equity", "option"],
      maxGrossLeverage: 3,
      maxConcentration: 0.2,
      agentTradingEnabled: true,
      agentApprovalThresholdNotional: 250_000,
    },
    ...stamps,
    ...overrides,
  });
}

export function makeBrokerAccount(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  const id = overrides.id ?? nextId(ID_PREFIX.brokerAccount);
  return BrokerAccount.parse({
    id,
    portfolioId: "pf_fx0001",
    broker: "ibkr",
    externalAccountId: `U${id}`,
    label: "IBKR main",
    currency: "USD",
    status: "connected",
    cashBalance: 1_000_000,
    buyingPower: 4_000_000,
    marginUsed: 0,
    lastHeartbeatAt: T0,
    ...stamps,
    ...overrides,
  });
}

export function makePosition(overrides: Partial<Position> = {}): Position {
  return Position.parse({
    id: nextId(ID_PREFIX.position),
    portfolioId: "pf_fx0001",
    brokerAccountId: "acct_fx0001",
    instrumentId: "ins_fx0001",
    symbol: "INS_FX0001",
    assetClass: "equity",
    quantity: 100,
    averagePrice: 100,
    markPrice: 101,
    marketValue: 10_100,
    unrealizedPnl: 100,
    realizedPnl: 0,
    strategyId: null,
    openedAt: T0,
    closedAt: null,
    ...stamps,
    ...overrides,
  });
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return Order.parse({
    id: nextId(ID_PREFIX.order),
    portfolioId: "pf_fx0001",
    brokerAccountId: "acct_fx0001",
    broker: "ibkr",
    instrumentId: "ins_fx0001",
    symbol: "INS_FX0001",
    assetClass: "equity",
    side: "BUY",
    type: "LIMIT",
    quantity: 100,
    limitPrice: 100,
    stopPrice: null,
    timeInForce: "DAY",
    status: "ROUTED",
    origin: "manual",
    createdBy: USER_ACTOR,
    strategyId: null,
    signalId: null,
    agentRunId: null,
    rationale: "fixture",
    estimatedNotional: 10_000,
    filledQuantity: 0,
    averageFillPrice: null,
    externalOrderId: null,
    riskChecks: [
      { rule: "order_notional", passed: true, message: "ok", observed: 10_000, limit: 500_000 },
      { rule: "gross_exposure_pct_nav", passed: true, message: "ok", observed: 0.5, limit: 3 },
    ],
    approvalId: null,
    rejectionReason: null,
    submittedAt: T0,
    completedAt: null,
    ...stamps,
    ...overrides,
  });
}

export function makeFill(overrides: Partial<Fill> = {}): Fill {
  const id = overrides.id ?? nextId(ID_PREFIX.fill);
  return Fill.parse({
    id,
    orderId: "ord_fx0001",
    portfolioId: "pf_fx0001",
    instrumentId: "ins_fx0001",
    symbol: "INS_FX0001",
    side: "BUY",
    quantity: 100,
    price: 100,
    commission: 1,
    externalFillId: `X${id}`,
    venue: "SMART",
    executedAt: T0,
    ...overrides,
  });
}

export function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  const id = overrides.id ?? nextId(ID_PREFIX.strategy);
  return Strategy.parse({
    id,
    code: overrides.code ?? id.toUpperCase(),
    name: `Strategy ${id}`,
    description: "Fixture strategy",
    thesis: "Momentum persists",
    style: "momentum",
    assetClasses: ["equity"],
    instrumentIds: ["ins_fx0001"],
    status: "research",
    ownerUserId: "usr_fx0001",
    deskId: "desk_fx0001",
    deployments: [],
    parameters: { lookback: 20, threshold: 0.5, enabled: true, mode: "fast" },
    backtest: null,
    live: null,
    version: 1,
    ...stamps,
    ...overrides,
  });
}

export function makeBacktest(overrides: Partial<Backtest> = {}): Backtest {
  return Backtest.parse({
    id: nextId(ID_PREFIX.backtest),
    strategyId: "strat_fx0001",
    requestedByUserId: "usr_fx0001",
    from: "2025-01-01",
    to: "2026-01-01",
    initialCapital: 1_000_000,
    parameters: { lookback: 20 },
    status: "queued",
    stats: null,
    equityCurve: [],
    summary: "",
    ...stamps,
    ...overrides,
  });
}

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return Agent.parse({
    id: nextId(ID_PREFIX.agent),
    kind: "signal_generation",
    name: "Fixture agent",
    description: "Generates signals",
    status: "idle",
    autonomy: "supervised",
    model: "claude-fable-5-1",
    portfolioId: "pf_fx0001",
    deskId: "desk_fx0001",
    strategyIds: [],
    tools: ["get_quote", "list_positions"],
    schedule: { description: "every 15m during RTH", intervalMinutes: 15, enabled: true },
    guardrails: ["never exceed mandate"],
    maxStepsPerRun: 12,
    maxNotionalPerRun: 100_000,
    ownerUserId: "usr_fx0001",
    lastRunAt: null,
    lastRunId: null,
    ...stamps,
    ...overrides,
  });
}

export function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return AgentRun.parse({
    id: nextId(ID_PREFIX.agentRun),
    agentId: "agt_fx0001",
    agentKind: "signal_generation",
    agentName: "Fixture agent",
    portfolioId: "pf_fx0001",
    status: "running",
    trigger: "manual",
    triggeredBy: USER_ACTOR,
    objective: "Find opportunities",
    input: { instrumentIds: ["ins_fx0001"], riskBudget: 0.01 },
    output: null,
    summary: "",
    stepCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    signalIds: [],
    orderIds: [],
    error: null,
    startedAt: T0,
    finishedAt: null,
    ...overrides,
  });
}

export function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return AgentStep.parse({
    id: nextId(ID_PREFIX.agentStep),
    runId: "run_fx0001",
    index: 0,
    kind: "thought",
    content: "Thinking...",
    toolName: null,
    toolInput: null,
    toolOutput: null,
    inputTokens: 10,
    outputTokens: 5,
    latencyMs: 120,
    at: T0,
    ...overrides,
  });
}

export function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return Signal.parse({
    id: nextId(ID_PREFIX.signal),
    instrumentId: "ins_fx0001",
    symbol: "INS_FX0001",
    assetClass: "equity",
    portfolioId: "pf_fx0001",
    strategyId: null,
    agentId: "agt_fx0001",
    runId: null,
    direction: "LONG",
    side: "BUY",
    conviction: 0.7,
    expectedReturnPct: 0.03,
    horizonHours: 48,
    suggestedNotional: 50_000,
    suggestedQuantity: 500,
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    thesis: "Breakout",
    factors: [{ factor: "momentum", weight: 0.6, evidence: "20d high" }],
    status: "new",
    createdAt: T0,
    expiresAt: at(60 * 48),
    ...overrides,
  });
}

export function makeRiskLimit(overrides: Partial<RiskLimit> = {}): RiskLimit {
  return RiskLimit.parse({
    id: nextId(ID_PREFIX.riskLimit),
    name: "Gross exposure",
    scope: "platform",
    scopeId: null,
    metric: "gross_exposure_pct_nav",
    qualifier: null,
    threshold: 3,
    warnThreshold: 2.5,
    action: "block",
    enabled: true,
    createdByUserId: "usr_fx0001",
    ...stamps,
    ...overrides,
  });
}

export function makeRiskBreach(overrides: Partial<RiskBreach> = {}): RiskBreach {
  return RiskBreach.parse({
    id: nextId(ID_PREFIX.riskBreach),
    limitId: "lim_fx0001",
    limitName: "Gross exposure",
    metric: "gross_exposure_pct_nav",
    scope: "portfolio",
    scopeId: "pf_fx0001",
    portfolioId: "pf_fx0001",
    observed: 3.2,
    threshold: 3,
    severity: "critical",
    status: "open",
    message: "Gross exposure above limit",
    actionTaken: "blocked order",
    detectedBy: SYSTEM,
    detectedAt: T0,
    acknowledgedByUserId: null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  });
}

export function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return ApprovalRequest.parse({
    id: nextId(ID_PREFIX.approval),
    type: "order",
    status: "pending",
    subjectId: "ord_fx0001",
    subjectLabel: "BUY 100 INS_FX0001",
    portfolioId: "pf_fx0001",
    deskId: "desk_fx0001",
    requestedBy: AGENT_ACTOR,
    reason: "Agent order above threshold",
    riskSummary: "",
    requiredPermission: "approvals:decide",
    notional: 10_000,
    decidedByUserId: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: T0,
    expiresAt: at(60),
    ...overrides,
  });
}

export function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return AuditEvent.parse({
    id: nextId(ID_PREFIX.audit),
    action: "order.created",
    actor: USER_ACTOR,
    targetType: "order",
    targetId: "ord_fx0001",
    portfolioId: "pf_fx0001",
    deskId: "desk_fx0001",
    summary: "Order created",
    data: { quantity: 100, nested: { ok: true } },
    ip: null,
    at: T0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// `build*` aliases used by the API integration helpers. These are the same
// builders under the naming convention that workstream adopted, plus a few
// asset-class-specific instrument shortcuts and the full role catalogue.
// ---------------------------------------------------------------------------
export const buildUser = makeUser;
export const buildRole = makeRole;
export const buildDesk = makeDesk;
export const buildInstrument = makeInstrument;
export const buildBar = makeBar;
export const buildPortfolio = makePortfolio;
export const buildBrokerAccount = makeBrokerAccount;
export const buildPosition = makePosition;
export const buildOrder = makeOrder;
export const buildFill = makeFill;
export const buildStrategy = makeStrategy;
export const buildBacktest = makeBacktest;
export const buildAgent = makeAgent;
export const buildAgentRun = makeAgentRun;
export const buildAgentStep = makeAgentStep;
export const buildSignal = makeSignal;
export const buildRiskLimit = makeRiskLimit;
export const buildRiskBreach = makeRiskBreach;
export const buildApproval = makeApproval;
export const buildAuditEvent = makeAuditEvent;

/** Every role in the RBAC catalogue, ready to persist through RoleRepository. */
export function buildAllRoles(): Role[] {
  return ROLE_CATALOG.map((r) => makeRole({ id: `role_${r.key}`, key: r.key, name: r.name, description: r.description, permissions: [...r.permissions] }));
}

/** An equity instrument on IBKR. */
export function buildEquity(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "AAPL",
    name: "Apple Inc.",
    assetClass: "equity",
    broker: "ibkr",
    venue: "NASDAQ",
    currency: "USD",
    multiplier: 1,
    tickSize: 0.01,
    details: { assetClass: "equity", exchange: "NASDAQ", sector: "Technology" },
    ...overrides,
  });
}

/** A forex pair on Oanda. */
export function buildForex(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    assetClass: "forex",
    broker: "oanda",
    venue: "OANDA",
    currency: "USD",
    multiplier: 1,
    tickSize: 0.00001,
    lotSize: 1000,
    details: { assetClass: "forex", baseCurrency: "EUR", quoteCurrency: "USD", pipSize: 0.0001 },
    ...overrides,
  });
}

/** A crypto pair on Coinbase. */
export function buildCrypto(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "BTC-USD",
    name: "Bitcoin / US Dollar",
    assetClass: "crypto",
    broker: "coinbase",
    venue: "COINBASE",
    currency: "USD",
    multiplier: 1,
    tickSize: 0.01,
    lotSize: 0.0001,
    details: { assetClass: "crypto", baseAsset: "BTC", quoteAsset: "USD" },
    ...overrides,
  });
}

/** A futures contract on Tradovate. */
export function buildFuture(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "ESZ6",
    name: "E-mini S&P 500 Dec 2026",
    assetClass: "future",
    broker: "tradovate",
    venue: "CME",
    currency: "USD",
    multiplier: 50,
    tickSize: 0.25,
    details: { assetClass: "future", rootSymbol: "ES", expiry: "2026-12-18", multiplier: 50, tickSize: 0.25 },
    ...overrides,
  });
}

/** An option contract on IBKR. */
export function buildOption(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "SPY 261218C00620000",
    name: "SPY Dec 18 2026 620 Call",
    assetClass: "option",
    broker: "ibkr",
    venue: "CBOE",
    currency: "USD",
    multiplier: 100,
    tickSize: 0.01,
    details: { assetClass: "option", underlyingSymbol: "SPY", strike: 620, expiry: "2026-12-18", right: "CALL", multiplier: 100 },
    ...overrides,
  });
}

/** A Kalshi event contract. */
export function buildEvent(overrides: Partial<Instrument> = {}): Instrument {
  return makeInstrument({
    symbol: "FED-DEC26-CUT",
    name: "Fed cuts rates in December 2026",
    assetClass: "event",
    broker: "kalshi",
    venue: "KALSHI",
    currency: "USD",
    multiplier: 1,
    tickSize: 0.01,
    details: { assetClass: "event", question: "Will the Fed cut rates at the December 2026 meeting?", closeTime: "2026-12-16T19:00:00.000Z", settlementValue: 1 },
    ...overrides,
  });
}
