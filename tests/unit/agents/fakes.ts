/**
 * Test doubles for the agent layer.
 *
 * The agent tests never touch the real OrderService (or any other application
 * service): every peer service is a hand-rolled fake backed by the in-memory
 * repositories, so a failure here is always a failure in lib/agents.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Actor, Principal, User } from "@/lib/domain/auth";
import type { AssetClass, Bar, Instrument, Quote } from "@/lib/domain/instrument";
import type { Portfolio, PortfolioSnapshot, Position } from "@/lib/domain/portfolio";
import type { CreateOrderInput, Fill, Order, OrderFilter } from "@/lib/domain/order";
import type { RiskBreach, RiskReport } from "@/lib/domain/risk";
import type { Agent, AgentRun } from "@/lib/domain/agent";
import type {
  ApprovalService,
  AuditService,
  MarketDataService,
  MarketOverview,
  OrderService,
  PortfolioService,
  RiskService,
  StrategyService,
} from "@/lib/services/interfaces";
import { AuditServiceImpl } from "@/lib/services/audit.service";
import { ALL_ROWS, PortfolioScope } from "@/lib/services/authz";
import { FixedClock } from "@/lib/core/clock";
import { SequentialIdGenerator, ID_PREFIX } from "@/lib/core/ids";
import { NoopLogger } from "@/lib/core/logger";
import { NotFoundError } from "@/lib/core/errors";
import { createInMemoryRepositories, type InMemoryRepositories } from "@/lib/repositories/memory";
import { principalFromUser } from "@/lib/auth/permissions";
import { MockLLMProvider } from "@/lib/llm";
import type { LLMCompletion, LLMCompletionRequest, LLMProvider, LLMUsage } from "@/lib/llm/types";
import type { AgentServices, ServicesAccessor } from "@/lib/agents/services";
import { AgentRuntime, KillSwitch, buildAgentPrincipal } from "@/lib/agents/runtime";
import { PortfolioCycleOrchestrator } from "@/lib/agents/orchestrator";
import { AgentServiceImpl } from "@/lib/agents/agent.service";
import { SignalServiceImpl } from "@/lib/agents/signal.service";
import { ALL_TOOL_NAMES, createToolRegistry } from "@/lib/agents/tools";
import type { ToolContext, ToolRegistry } from "@/lib/agents/tools/registry";
import { buildAllRoles, buildCrypto, buildDesk, buildEquity, buildForex, buildPortfolio, buildUser, makeAgent, makeAgentRun, resetFixtureIds, T0 } from "@/tests/fixtures/entities";

/** Deterministic reference price per instrument id, used by every market fake. */
export const PRICES: Record<string, number> = { ins_aapl: 200, ins_eurusd: 1.1, ins_btc: 60_000 };
const DEFAULT_PRICE = 100;

function priceOf(instrumentId: string): number {
  return PRICES[instrumentId] ?? DEFAULT_PRICE;
}

/** Wrap a partial implementation; calling anything not provided fails loudly. */
function stub<T extends object>(name: string, impl: Partial<T>): T {
  return new Proxy(impl, {
    get(target, prop, receiver): unknown {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (value !== undefined || prop === "then") return value;
      return () => {
        throw new Error(`${name}.${String(prop)}() is not implemented in the agent test fakes`);
      };
    },
  }) as T;
}

// ---------------------------------------------------------------------------
// OrderService
// ---------------------------------------------------------------------------

export interface FakeOrderCall {
  via: "agent" | "principal";
  input: CreateOrderInput;
  agentId: string | null;
  runId: string | null;
}

/**
 * Records every submission and persists a plausible Order. `outcome` controls
 * the status the pipeline "returns", so the risk-rejected and approval paths
 * can be exercised without the real risk engine.
 */
export class FakeOrderService implements OrderService {
  readonly calls: FakeOrderCall[] = [];
  outcome: { status: Order["status"]; rejectionReason?: string } = { status: "FILLED" };
  failWith: Error | null = null;

  constructor(
    private readonly repos: InMemoryRepositories,
    private readonly clock: FixedClock,
    private readonly ids: SequentialIdGenerator,
  ) {}

  async get(_principal: Principal, id: string): Promise<Order> {
    const order = await this.repos.orders.findById(id);
    if (!order) throw new NotFoundError("Order", id);
    return order;
  }

  async list(_principal: Principal, filter: OrderFilter, page: PageQuery): Promise<Paged<Order>> {
    return this.repos.orders.list(filter, page);
  }

  async listFills(_principal: Principal, orderId: string): Promise<Fill[]> {
    return this.repos.fills.listByOrder(orderId);
  }

  async submit(principal: Principal, input: CreateOrderInput): Promise<Order> {
    this.calls.push({ via: "principal", input, agentId: null, runId: input.agentRunId ?? null });
    return this.persist(input, { kind: "user", id: principal.userId, name: principal.name });
  }

  async submitForAgent(agent: Agent, run: AgentRun, input: CreateOrderInput): Promise<Order> {
    this.calls.push({ via: "agent", input, agentId: agent.id, runId: run.id });
    if (this.failWith) throw this.failWith;
    return this.persist(input, { kind: "agent", id: agent.id, name: agent.name, runId: run.id });
  }

  async cancel(_principal: Principal, id: string, reason: string): Promise<Order> {
    const order = await this.repos.orders.findById(id);
    if (!order) throw new NotFoundError("Order", id);
    return this.repos.orders.update(id, { status: "CANCELLED", rejectionReason: reason, completedAt: this.clock.nowIso() });
  }

  async onApprovalDecided(): Promise<Order> {
    throw new Error("FakeOrderService.onApprovalDecided() is not implemented");
  }

  async closePosition(): Promise<Order> {
    throw new Error("FakeOrderService.closePosition() is not implemented");
  }

  private async persist(input: CreateOrderInput, createdBy: Actor): Promise<Order> {
    const instrument = await this.repos.instruments.findById(input.instrumentId);
    if (!instrument) throw new NotFoundError("Instrument", input.instrumentId);
    const price = input.limitPrice ?? priceOf(instrument.id);
    const now = this.clock.nowIso();
    const filled = this.outcome.status === "FILLED";
    return this.repos.orders.create({
      id: this.ids.next(ID_PREFIX.order),
      portfolioId: input.portfolioId,
      brokerAccountId: "acct_test",
      broker: instrument.broker,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      side: input.side,
      type: input.type ?? "MARKET",
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      timeInForce: input.timeInForce ?? "DAY",
      status: this.outcome.status,
      origin: input.origin ?? "manual",
      createdBy,
      strategyId: input.strategyId ?? null,
      signalId: input.signalId ?? null,
      agentRunId: input.agentRunId ?? null,
      rationale: input.rationale ?? "",
      estimatedNotional: input.quantity * price * instrument.multiplier,
      filledQuantity: filled ? input.quantity : 0,
      averageFillPrice: filled ? price : null,
      externalOrderId: filled ? "X-1" : null,
      riskChecks: [{ rule: "order_notional", passed: true, message: "within limit", observed: input.quantity * price, limit: 5_000_000 }],
      approvalId: null,
      rejectionReason: this.outcome.rejectionReason ?? null,
      submittedAt: now,
      completedAt: filled ? now : null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// LLM doubles
// ---------------------------------------------------------------------------

/** An LLMProvider whose `complete()` always throws; drives the failure path. */
export class ThrowingLLMProvider implements LLMProvider {
  readonly name = "throwing";
  constructor(private readonly message = "gateway unavailable") {}
  async complete(): Promise<LLMCompletion> {
    throw new Error(this.message);
  }
  async completeJson<T>(): Promise<{ value: T; usage: LLMUsage }> {
    throw new Error(this.message);
  }
}

/** Always asks for the same tool, so the turn budget is the only stop condition. */
export class LoopingLLMProvider implements LLMProvider {
  readonly name = "looping";
  turns = 0;
  constructor(
    private readonly toolName: string,
    private readonly input: Record<string, unknown> = {},
  ) {}
  async complete(req: LLMCompletionRequest): Promise<LLMCompletion> {
    this.turns += 1;
    return {
      id: `cmpl_loop_${this.turns}`,
      model: req.model,
      content: [
        { type: "text", text: `Turn ${this.turns}: still gathering context.` },
        { type: "tool_use", id: `toolu_${this.turns}`, name: this.toolName, input: this.input },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.001, latencyMs: 10 },
    };
  }
  async completeJson<T>(): Promise<{ value: T; usage: LLMUsage }> {
    throw new Error("not implemented");
  }
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export type UserKey = "admin" | "pm" | "trader" | "quant" | "analyst" | "compliance" | "otherTrader";

export interface AgentWorld {
  repos: InMemoryRepositories;
  clock: FixedClock;
  ids: SequentialIdGenerator;
  llm: MockLLMProvider;
  registry: ToolRegistry;
  killSwitch: KillSwitch;
  runtime: AgentRuntime;
  orchestrator: PortfolioCycleOrchestrator;
  agentService: AgentServiceImpl;
  signalService: SignalServiceImpl;
  orders: FakeOrderService;
  services: AgentServices;
  accessor: ServicesAccessor;
  scope: PortfolioScope;
  riskBreaches: RiskBreach[];
  portfolio: Portfolio;
  otherPortfolio: Portfolio;
  instruments: Record<"aapl" | "eurusd" | "btc", Instrument>;
  users: Record<UserKey, User>;
  principal(key: UserKey): Principal;
  /** Swap the provider used by a freshly built runtime. */
  withProvider(provider: LLMProvider): AgentRuntime;
}

/** Build the in-memory world every agent test runs against. */
export async function createAgentWorld(): Promise<AgentWorld> {
  resetFixtureIds("aw");
  const clock = new FixedClock(T0);
  const ids = new SequentialIdGenerator("aw");
  const logger = new NoopLogger();
  const repos = createInMemoryRepositories();

  for (const role of buildAllRoles()) await repos.roles.upsert(role);

  const desk = await repos.desks.create(buildDesk({ id: "desk_main", code: "GM", name: "Global Macro" }));
  const otherDesk = await repos.desks.create(buildDesk({ id: "desk_other", code: "EQD", name: "Equity Derivatives" }));

  const roleOf: Record<UserKey, Parameters<typeof buildUser>[0]> = {
    admin: { roles: ["global_admin"], deskIds: [desk.id] },
    pm: { roles: ["portfolio_manager"], deskIds: [desk.id] },
    trader: { roles: ["trader"], deskIds: [desk.id] },
    quant: { roles: ["quant_researcher"], deskIds: [desk.id] },
    analyst: { roles: ["analyst"], deskIds: [desk.id] },
    compliance: { roles: ["compliance_officer"], deskIds: [desk.id] },
    otherTrader: { roles: ["trader"], deskIds: [otherDesk.id] },
  };
  const users = {} as Record<UserKey, User>;
  for (const [key, overrides] of Object.entries(roleOf) as Array<[UserKey, Partial<User>]>) {
    users[key] = await repos.users.create(buildUser({ id: `usr_${key}`, email: `${key}@agenticprop.io`, name: `${key} user`, ...overrides }));
  }

  const portfolio = await repos.portfolios.create(
    buildPortfolio({ id: "pf_main", deskId: desk.id, code: "GM-ALPHA", managerUserId: users.pm.id, nav: 50_000_000, cash: 20_000_000 }),
  );
  const otherPortfolio = await repos.portfolios.create(buildPortfolio({ id: "pf_other", deskId: otherDesk.id, code: "EQD-ONE" }));

  const instruments = {
    aapl: await repos.instruments.create(buildEquity({ id: "ins_aapl", symbol: "AAPL" })),
    eurusd: await repos.instruments.create(buildForex({ id: "ins_eurusd", symbol: "EUR/USD" })),
    btc: await repos.instruments.create(buildCrypto({ id: "ins_btc", symbol: "BTC-USD" })),
  };

  const scope = new PortfolioScope(repos.portfolios);
  const audit = new AuditServiceImpl(repos.audit, scope, clock, ids);
  const orders = new FakeOrderService(repos, clock, ids);
  const riskBreaches: RiskBreach[] = [];

  const market = stub<MarketDataService>("MarketDataService", {
    async getInstrument(_p, id) {
      const found = await repos.instruments.findById(id);
      if (!found) throw new NotFoundError("Instrument", id);
      return found;
    },
    async listInstruments(_p, filter, page) {
      return repos.instruments.list(filter, page);
    },
    async getQuote(_p, id) {
      const found = await repos.instruments.findById(id);
      if (!found) throw new NotFoundError("Instrument", id);
      return quoteFor(found, clock.nowIso());
    },
    async getQuotes(_p, instrumentIds) {
      const found = await repos.instruments.listByIds(instrumentIds);
      return found.map((i) => quoteFor(i, clock.nowIso()));
    },
    async getBars(_p, instrumentId, _interval, count) {
      return barsFor(instrumentId, count, clock.now());
    },
    async getMarketOverview() {
      return overviewFor(await repos.instruments.list({}, ALL_ROWS).then((p) => p.items), clock.nowIso());
    },
  });

  const portfolios = stub<PortfolioService>("PortfolioService", {
    async get(_p, id) {
      const found = await repos.portfolios.findById(id);
      if (!found) throw new NotFoundError("Portfolio", id);
      return found;
    },
    async snapshot(_p, id) {
      const found = await repos.portfolios.findById(id);
      if (!found) throw new NotFoundError("Portfolio", id);
      const positions = (await repos.positions.list({ portfolioId: id, open: true }, ALL_ROWS)).items;
      return snapshotFor(found, positions, clock.nowIso());
    },
    async listPositions(_p, filter, page) {
      return repos.positions.list(filter, page);
    },
  });

  const risk = stub<RiskService>("RiskService", {
    async report(_p, portfolioId) {
      const found = await repos.portfolios.findById(portfolioId);
      if (!found) throw new NotFoundError("Portfolio", portfolioId);
      const limits = (await repos.riskLimits.list({ enabled: true }, ALL_ROWS)).items;
      return reportFor(found, limits, clock.nowIso());
    },
    async scanPortfolio() {
      return [...riskBreaches];
    },
  });

  const strategies = stub<StrategyService>("StrategyService", {
    async get(_p, id) {
      const found = await repos.strategies.findById(id);
      if (!found) throw new NotFoundError("Strategy", id);
      return found;
    },
  });

  const approvals = stub<ApprovalService>("ApprovalService", {});
  const services: AgentServices = { market, portfolios, orders, risk, strategies, approvals, audit: audit as AuditService };
  const accessor: ServicesAccessor = () => services;

  const llm = new MockLLMProvider({ seed: 7 });
  const registry = createToolRegistry();
  const killSwitch = new KillSwitch();
  const runtime = new AgentRuntime({ repos, services: accessor, llm, registry, clock, ids, logger, killSwitch });
  const orchestrator = new PortfolioCycleOrchestrator(repos, scope, accessor, runtime, logger);
  const agentService = new AgentServiceImpl(repos, scope, accessor, runtime, orchestrator, registry, killSwitch, clock, ids, logger);
  const signalService = new SignalServiceImpl(repos, scope, accessor, clock, logger);

  const cache = new Map<UserKey, Principal>();
  return {
    repos,
    clock,
    ids,
    llm,
    registry,
    killSwitch,
    runtime,
    orchestrator,
    agentService,
    signalService,
    orders,
    services,
    accessor,
    scope,
    riskBreaches,
    portfolio,
    otherPortfolio,
    instruments,
    users,
    principal(key) {
      const hit = cache.get(key);
      if (hit) return hit;
      const p = principalFromUser(users[key]);
      cache.set(key, p);
      return p;
    },
    withProvider(provider) {
      return new AgentRuntime({ repos, services: accessor, llm: provider, registry, clock, ids, logger, killSwitch });
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic market data
// ---------------------------------------------------------------------------

function quoteFor(instrument: Instrument, asOf: string): Quote {
  const last = priceOf(instrument.id);
  const spread = last * 0.0005;
  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    bid: last - spread,
    ask: last + spread,
    last,
    mid: last,
    bidSize: 500,
    askSize: 500,
    volume: 1_000_000,
    changePct: instrument.assetClass === "forex" ? -0.004 : 0.012,
    impliedVol: null,
    asOf,
  };
}

function barsFor(instrumentId: string, count: number, now: Date): Bar[] {
  const base = priceOf(instrumentId);
  return Array.from({ length: count }, (_, i) => {
    const drift = 1 + (i - count) * 0.001;
    const close = round2(base * drift);
    return {
      instrumentId,
      time: new Date(now.getTime() - (count - i) * 86_400_000).toISOString(),
      open: round2(close * 0.999),
      high: round2(close * 1.004),
      low: round2(close * 0.996),
      close,
      volume: 1_000_000 + i * 1_000,
    };
  });
}

function overviewFor(instruments: Instrument[], asOf: string): MarketOverview {
  return {
    asOf,
    regime: "risk_on",
    headline: "Equities extend gains as front-end yields drift lower",
    indicators: [{ name: "VIX", value: 14.2, changePct: -0.05, unit: "pts" }],
    movers: instruments.slice(0, 4).map((i) => ({
      instrumentId: i.id,
      symbol: i.symbol,
      assetClass: i.assetClass,
      last: priceOf(i.id),
      changePct: i.assetClass === "forex" ? -0.004 : 0.012,
    })),
    eventCalendar: [{ time: asOf, event: "US CPI", importance: "high" }],
  };
}

function snapshotFor(p: Portfolio, positions: Position[], asOf: string): PortfolioSnapshot {
  const gross = positions.reduce((a, x) => a + Math.abs(x.marketValue), 0);
  const net = positions.reduce((a, x) => a + x.marketValue, 0);
  const exposureByAssetClass = {} as Record<AssetClass, number>;
  for (const pos of positions) exposureByAssetClass[pos.assetClass] = (exposureByAssetClass[pos.assetClass] ?? 0) + pos.marketValue;
  return {
    portfolioId: p.id,
    asOf,
    nav: p.nav,
    cash: p.cash,
    grossExposure: gross,
    netExposure: net,
    grossLeverage: p.nav > 0 ? gross / p.nav : 0,
    unrealizedPnl: positions.reduce((a, x) => a + x.unrealizedPnl, 0),
    realizedPnl: positions.reduce((a, x) => a + x.realizedPnl, 0),
    dayPnl: 0,
    inceptionReturnPct: (p.nav - p.inceptionCapital) / p.inceptionCapital,
    positionCount: positions.length,
    exposureByAssetClass,
    topConcentration: positions.length ? { symbol: positions[0].symbol, pctOfNav: Math.abs(positions[0].marketValue) / p.nav } : null,
  };
}

function reportFor(p: Portfolio, limits: RiskReport["limits"][number]["limit"][], asOf: string): RiskReport {
  return {
    portfolioId: p.id,
    asOf,
    nav: p.nav,
    grossExposurePctNav: 1.2,
    netExposurePctNav: 0.8,
    var95PctNav: 0.021,
    dailyLossPctNav: -0.003,
    drawdownPct: 0.04,
    marginUtilizationPct: 0.3,
    largestPosition: null,
    limits: limits.map((limit) => ({
      limit,
      observed: limit.threshold * 1.1,
      utilizationPct: 110,
      status: "breached" as const,
    })),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export { stub };

// ---------------------------------------------------------------------------
// Agent / run / tool-context helpers
// ---------------------------------------------------------------------------

/** Persist an agent owned by `pm`, scoped to the main portfolio, granted every tool. */
export async function seedAgent(world: AgentWorld, overrides: Partial<Agent> = {}): Promise<Agent> {
  return world.repos.agents.create(
    makeAgent({
      ownerUserId: world.users.pm.id,
      portfolioId: world.portfolio.id,
      deskId: "desk_main",
      tools: [...ALL_TOOL_NAMES],
      autonomy: "autonomous",
      ...overrides,
    }),
  );
}

/** Persist a running AgentRun for `agent`. */
export async function seedRun(world: AgentWorld, agent: Agent, overrides: Partial<AgentRun> = {}): Promise<AgentRun> {
  return world.repos.agentRuns.create(
    makeAgentRun({
      agentId: agent.id,
      agentKind: agent.kind,
      agentName: agent.name,
      portfolioId: agent.portfolioId,
      startedAt: world.clock.nowIso(),
      ...overrides,
    }),
  );
}

/** A ToolContext for direct `registry.invoke` calls, with the agent's synthetic principal. */
export function toolContextFor(world: AgentWorld, agent: Agent, run: AgentRun, owner: User = world.users.pm): ToolContext {
  return {
    agent,
    run,
    principal: buildAgentPrincipal(owner, agent, world.registry),
    services: world.services,
    repos: world.repos,
    clock: world.clock,
    ids: world.ids,
    logger: new NoopLogger(),
    created: { signalIds: [], orderIds: [] },
  };
}
