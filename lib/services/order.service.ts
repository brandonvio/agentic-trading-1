/**
 * Order management: the full pre-trade → route → fill → book pipeline.
 *
 *   validate → resolve portfolio/instrument/broker account → estimate notional
 *   → RiskService.preTradeCheck
 *       block            ⇒ RISK_REJECTED (breach already recorded by risk)
 *       require_approval ⇒ PENDING_APPROVAL + ApprovalRequest
 *       pass | warn      ⇒ route
 *   → BrokerAdapter.placeOrder → fills → position + cash + NAV → audit
 *
 * Risk rejections are an expected business outcome and are returned as order
 * state, not thrown. Infrastructure and authorization problems throw.
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Actor, Principal } from "@/lib/domain/auth";
import type { Instrument } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount, Position } from "@/lib/domain/portfolio";
import { CreateOrderInput, type Order, type OrderFilter, type Fill, TERMINAL_ORDER_STATUSES, LIVE_ORDER_STATUSES } from "@/lib/domain/order";
import type { Agent, AgentRun } from "@/lib/domain/agent";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { BrokerRegistry } from "@/lib/brokers/types";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { OrderService, RiskService, ApprovalService, AuditService, PreTradeDecision } from "./interfaces";
import { PortfolioScope, actorOf, requirePermission } from "./authz";
import { ALL_ROWS } from "./authz";
import { applyFill, averageFillPrice, notionalOf, statusForFillProgress } from "./helpers/execution-math";
import { startOfUtcDayIso } from "./helpers/time";

type OrderRepos = Pick<Repositories, "orders" | "fills" | "positions" | "portfolios" | "instruments" | "brokerAccounts" | "agents" | "signals">;

/** How long an order approval stays actionable before it expires. */
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export class OrderServiceImpl implements OrderService {
  constructor(
    private readonly repos: OrderRepos,
    private readonly brokers: BrokerRegistry,
    private readonly scope: PortfolioScope,
    private readonly risk: RiskService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Requires orders:read and visibility of the order's portfolio. */
  async get(principal: Principal, id: string): Promise<Order> {
    requirePermission(principal, "orders:read");
    const order = await this.repos.orders.findById(id);
    if (!order) throw new NotFoundError("Order", id);
    await this.scope.assertVisibleId(principal, order.portfolioId);
    return order;
  }

  /** Requires orders:read. Scoped to the principal's visible portfolios. */
  async list(principal: Principal, filter: OrderFilter, page: PageQuery): Promise<Paged<Order>> {
    requirePermission(principal, "orders:read");
    const scoped = await this.scope.filter(principal, filter.portfolioId);
    return this.repos.orders.list({ ...filter, ...scoped }, page);
  }

  /** Requires orders:read. */
  async listFills(principal: Principal, orderId: string): Promise<Fill[]> {
    await this.get(principal, orderId);
    return this.repos.fills.listByOrder(orderId);
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  /** Requires orders:create. Runs the full pipeline and returns the resulting order. */
  async submit(principal: Principal, input: CreateOrderInput, actor?: Actor): Promise<Order> {
    requirePermission(principal, "orders:create");
    const parsed = this.parseInput(input);
    const portfolio = await this.scope.load(principal, parsed.portfolioId);
    return this.runPipeline({ input: parsed, portfolio, actor: actor ?? actorOf(principal), agent: null, run: null });
  }

  /**
   * Agent-originated submission. There is no Principal: the agent's autonomy,
   * the portfolio mandate and the agent's per-run notional budget are the
   * authorization boundary, all enforced by RiskService.preTradeCheck plus the
   * budget check below.
   */
  async submitForAgent(agent: Agent, run: AgentRun, input: CreateOrderInput): Promise<Order> {
    const parsed = this.parseInput({ ...input, origin: "agent", agentRunId: run.id });
    const portfolio = await this.repos.portfolios.findById(parsed.portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", parsed.portfolioId);
    if (agent.portfolioId && agent.portfolioId !== portfolio.id) {
      throw new ConflictError("Agent is scoped to a different portfolio", { agentPortfolioId: agent.portfolioId, requested: portfolio.id });
    }
    const actor: Actor = { kind: "agent", id: agent.id, name: agent.name, runId: run.id };
    return this.runPipeline({ input: parsed, portfolio, actor, agent, run });
  }

  // -------------------------------------------------------------------------
  // Cancellation & lifecycle
  // -------------------------------------------------------------------------

  /** Requires orders:cancel. Cancels at the broker when the order is live, and withdraws any pending approval. */
  async cancel(principal: Principal, id: string, reason: string): Promise<Order> {
    requirePermission(principal, "orders:cancel");
    const order = await this.get(principal, id);
    if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
      throw new InvalidStateError(`Order is already ${order.status}`, { status: order.status });
    }
    if (LIVE_ORDER_STATUSES.includes(order.status) && order.externalOrderId) {
      const result = await this.brokers.get(order.broker).cancelOrder(order.externalOrderId);
      if (!result.cancelled) this.logger.warn("Broker declined cancellation", { orderId: id, message: result.message });
    }
    if (order.status === "PENDING_APPROVAL") {
      await this.approvals.cancel(order.id, reason);
    }
    const now = this.clock.nowIso();
    const cancelled = await this.repos.orders.update(id, { status: "CANCELLED", rejectionReason: reason, completedAt: now });
    await this.audit.record({
      action: "order.cancelled",
      actor: actorOf(principal),
      targetType: "Order",
      targetId: id,
      portfolioId: order.portfolioId,
      deskId: null,
      summary: `Cancelled ${order.side} ${order.quantity} ${order.symbol}: ${reason}`,
      data: { reason, previousStatus: order.status },
      ip: null,
    });
    return cancelled;
  }

  /** Called by ApprovalService when an order approval is decided. */
  async onApprovalDecided(orderId: string, approved: boolean, decidedBy: Actor, note: string): Promise<Order> {
    const order = await this.repos.orders.findById(orderId);
    if (!order) throw new NotFoundError("Order", orderId);
    if (order.status !== "PENDING_APPROVAL") {
      this.logger.warn("Approval decided for an order that is no longer pending", { orderId, status: order.status });
      return order;
    }
    if (!approved) {
      const now = this.clock.nowIso();
      const rejected = await this.repos.orders.update(orderId, {
        status: "APPROVAL_REJECTED",
        rejectionReason: note || "Approval rejected",
        completedAt: now,
      });
      await this.audit.record({
        action: "order.rejected",
        actor: decidedBy,
        targetType: "Order",
        targetId: orderId,
        portfolioId: order.portfolioId,
        deskId: null,
        summary: `Approval rejected for ${order.side} ${order.quantity} ${order.symbol}`,
        data: { note },
        ip: null,
      });
      return rejected;
    }
    const { instrument, account } = await this.resolveExecutionContext(order);
    return this.route(order, instrument, account, decidedBy);
  }

  /** Requires positions:close. Submits an offsetting market order for the whole position. */
  async closePosition(principal: Principal, positionId: string, rationale: string): Promise<Order> {
    requirePermission(principal, "positions:close");
    const position = await this.repos.positions.findById(positionId);
    if (!position) throw new NotFoundError("Position", positionId);
    await this.scope.assertVisibleId(principal, position.portfolioId);
    if (position.closedAt !== null || position.quantity === 0) {
      throw new InvalidStateError("Position is already closed", { positionId });
    }
    const isRiskUnwind = rationale.startsWith("RISK") && principal.permissions.includes("risk:breaches:resolve");
    // Deliberately bypasses the orders:create gate: closing risk is a distinct
    // capability, held by risk managers who may not open new positions.
    const portfolio = await this.scope.load(principal, position.portfolioId);
    const input = this.parseInput({
      portfolioId: position.portfolioId,
      instrumentId: position.instrumentId,
      side: position.quantity > 0 ? "SELL" : "BUY",
      type: "MARKET",
      quantity: Math.abs(position.quantity),
      timeInForce: "DAY",
      rationale,
      origin: isRiskUnwind ? "risk_unwind" : "manual",
      ...(position.strategyId ? { strategyId: position.strategyId } : {}),
    });
    return this.runPipeline({ input, portfolio, actor: actorOf(principal), agent: null, run: null });
  }

  // -------------------------------------------------------------------------
  // Pipeline internals
  // -------------------------------------------------------------------------

  private parseInput(input: CreateOrderInput): CreateOrderInput {
    const parsed = CreateOrderInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid order", parsed.error.flatten());
    const o = parsed.data;
    if ((o.type === "LIMIT" || o.type === "STOP_LIMIT") && o.limitPrice === undefined) {
      throw new ValidationError(`${o.type} orders require a limit price`);
    }
    if ((o.type === "STOP" || o.type === "STOP_LIMIT") && o.stopPrice === undefined) {
      throw new ValidationError(`${o.type} orders require a stop price`);
    }
    return o;
  }

  private async runPipeline(args: {
    input: CreateOrderInput;
    portfolio: Portfolio;
    actor: Actor;
    agent: Agent | null;
    run: AgentRun | null;
  }): Promise<Order> {
    const { input, portfolio, actor, agent, run } = args;
    const instrument = await this.repos.instruments.findById(input.instrumentId);
    if (!instrument) throw new NotFoundError("Instrument", input.instrumentId);
    if (!instrument.tradable) throw new ConflictError(`${instrument.symbol} is not tradable`, { instrumentId: instrument.id });

    const account = await this.repos.brokerAccounts.findByPortfolioAndBroker(portfolio.id, instrument.broker);
    if (!account) {
      throw new NotFoundError("BrokerAccount", `${portfolio.code}/${instrument.broker}`);
    }

    const estimatedNotional = await this.estimateNotional(input, instrument);
    const order = await this.createOrderRow({ input, portfolio, instrument, account, actor, estimatedNotional });

    // Per-run notional budget for agents, checked before the risk engine so the
    // agent gets a precise reason back.
    if (agent && run && agent.maxNotionalPerRun > 0) {
      const spent = await this.notionalSpentInRun(run);
      if (spent + estimatedNotional > agent.maxNotionalPerRun) {
        return this.reject(order, `Agent run notional budget exhausted: ${(spent + estimatedNotional).toFixed(0)} exceeds ${agent.maxNotionalPerRun.toFixed(0)}`, actor);
      }
    }

    const decision = await this.risk.preTradeCheck({ order, portfolio, instrument, actor, agent });
    const checked = await this.repos.orders.update(order.id, { riskChecks: decision.checks });
    await this.audit.record({
      action: "order.risk_checked",
      actor,
      targetType: "Order",
      targetId: order.id,
      portfolioId: portfolio.id,
      deskId: portfolio.deskId,
      summary: `Pre-trade risk: ${decision.outcome} for ${order.side} ${order.quantity} ${order.symbol}`,
      data: { outcome: decision.outcome, reasons: decision.reasons },
      ip: null,
    });

    if (decision.outcome === "block") {
      return this.reject(checked, decision.reasons.join("; ") || "Blocked by pre-trade risk", actor);
    }
    if (decision.outcome === "require_approval") {
      return this.requestApproval(checked, portfolio, decision, actor);
    }
    return this.route(checked, instrument, account, actor);
  }

  private async createOrderRow(args: {
    input: CreateOrderInput;
    portfolio: Portfolio;
    instrument: Instrument;
    account: BrokerAccount;
    actor: Actor;
    estimatedNotional: number;
  }): Promise<Order> {
    const { input, portfolio, instrument, account, actor, estimatedNotional } = args;
    const now = this.clock.nowIso();
    return this.repos.orders.create({
      id: this.ids.next(ID_PREFIX.order),
      portfolioId: portfolio.id,
      brokerAccountId: account.id,
      broker: instrument.broker,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      timeInForce: input.timeInForce,
      status: "PENDING_RISK",
      origin: input.origin,
      createdBy: actor,
      strategyId: input.strategyId ?? null,
      signalId: input.signalId ?? null,
      agentRunId: input.agentRunId ?? null,
      rationale: input.rationale,
      estimatedNotional,
      filledQuantity: 0,
      averageFillPrice: null,
      externalOrderId: null,
      riskChecks: [],
      approvalId: null,
      rejectionReason: null,
      submittedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Limit orders price off their own limit; everything else off the current mid. */
  private async estimateNotional(input: CreateOrderInput, instrument: Instrument): Promise<number> {
    if (input.limitPrice !== undefined) return notionalOf(input.quantity, input.limitPrice, instrument.multiplier);
    const quote = await this.brokers.get(instrument.broker).getQuote(instrument);
    const reference = quote.mid || quote.last || (quote.bid + quote.ask) / 2;
    return notionalOf(input.quantity, reference, instrument.multiplier);
  }

  private async notionalSpentInRun(run: AgentRun): Promise<number> {
    if (run.orderIds.length === 0) return 0;
    let total = 0;
    for (const id of run.orderIds) {
      const prior = await this.repos.orders.findById(id);
      if (prior && !["RISK_REJECTED", "APPROVAL_REJECTED", "CANCELLED"].includes(prior.status)) {
        total += prior.estimatedNotional;
      }
    }
    return total;
  }

  private async reject(order: Order, reason: string, actor: Actor): Promise<Order> {
    const rejected = await this.repos.orders.update(order.id, {
      status: "RISK_REJECTED",
      rejectionReason: reason,
      completedAt: this.clock.nowIso(),
    });
    await this.audit.record({
      action: "order.rejected",
      actor,
      targetType: "Order",
      targetId: order.id,
      portfolioId: order.portfolioId,
      deskId: null,
      summary: `Risk rejected ${order.side} ${order.quantity} ${order.symbol}`,
      data: { reason },
      ip: null,
    });
    return rejected;
  }

  private async requestApproval(order: Order, portfolio: Portfolio, decision: PreTradeDecision, actor: Actor): Promise<Order> {
    const approval = await this.approvals.request({
      type: "order",
      subjectId: order.id,
      subjectLabel: `${order.side} ${order.quantity} ${order.symbol} (${portfolio.code})`,
      portfolioId: portfolio.id,
      deskId: portfolio.deskId,
      requestedBy: actor,
      reason: order.rationale || "Order requires approval",
      riskSummary: decision.reasons.join("; "),
      requiredPermission: "approvals:decide",
      notional: order.estimatedNotional,
      expiresAt: new Date(this.clock.now().getTime() + APPROVAL_TTL_MS).toISOString(),
    });
    const pending = await this.repos.orders.update(order.id, { status: "PENDING_APPROVAL", approvalId: approval.id });
    await this.audit.record({
      action: "order.approval_requested",
      actor,
      targetType: "Order",
      targetId: order.id,
      portfolioId: portfolio.id,
      deskId: portfolio.deskId,
      summary: `Approval requested for ${order.side} ${order.quantity} ${order.symbol}`,
      data: { approvalId: approval.id, notional: order.estimatedNotional, reasons: decision.reasons },
      ip: null,
    });
    return pending;
  }

  private async resolveExecutionContext(order: Order): Promise<{ instrument: Instrument; account: BrokerAccount }> {
    const instrument = await this.repos.instruments.findById(order.instrumentId);
    if (!instrument) throw new NotFoundError("Instrument", order.instrumentId);
    const account = await this.repos.brokerAccounts.findById(order.brokerAccountId);
    if (!account) throw new NotFoundError("BrokerAccount", order.brokerAccountId);
    return { instrument, account };
  }

  /** Send to the broker and book whatever comes back. */
  private async route(order: Order, instrument: Instrument, account: BrokerAccount, actor: Actor): Promise<Order> {
    const now = this.clock.nowIso();
    const routed = await this.repos.orders.update(order.id, { status: "ROUTED", submittedAt: now });
    const result = await this.brokers.get(order.broker).placeOrder({ order: routed, instrument, account });

    if (!result.accepted) {
      const errored = await this.repos.orders.update(order.id, {
        status: "ERROR",
        rejectionReason: `${result.code}: ${result.reason}`,
        completedAt: this.clock.nowIso(),
      });
      await this.audit.record({
        action: "order.rejected",
        actor,
        targetType: "Order",
        targetId: order.id,
        portfolioId: order.portfolioId,
        deskId: null,
        summary: `Broker rejected ${order.side} ${order.quantity} ${order.symbol}: ${result.reason}`,
        data: { code: result.code, reason: result.reason, broker: order.broker },
        ip: null,
      });
      return errored;
    }

    await this.audit.record({
      action: "order.routed",
      actor,
      targetType: "Order",
      targetId: order.id,
      portfolioId: order.portfolioId,
      deskId: null,
      summary: `Routed ${order.side} ${order.quantity} ${order.symbol} to ${order.broker}`,
      data: { externalOrderId: result.externalOrderId, status: result.status },
      ip: null,
    });

    for (const fill of result.fills) {
      await this.repos.fills.create(fill);
      await this.bookFill(order, fill, instrument, account);
    }

    const fills = await this.repos.fills.listByOrder(order.id);
    const filledQuantity = fills.reduce((s, f) => s + f.quantity, 0);
    const status = statusForFillProgress(filledQuantity, order.quantity, result.status === "FILLED" ? "ACKNOWLEDGED" : result.status);
    const final = await this.repos.orders.update(order.id, {
      status,
      externalOrderId: result.externalOrderId,
      filledQuantity,
      averageFillPrice: averageFillPrice(fills),
      completedAt: status === "FILLED" ? this.clock.nowIso() : null,
    });

    if (filledQuantity > 0) {
      await this.audit.record({
        action: "order.filled",
        actor,
        targetType: "Order",
        targetId: order.id,
        portfolioId: order.portfolioId,
        deskId: null,
        summary: `${status === "FILLED" ? "Filled" : "Partially filled"} ${filledQuantity}/${order.quantity} ${order.symbol} @ ${(averageFillPrice(fills) ?? 0).toFixed(4)}`,
        data: { filledQuantity, averageFillPrice: averageFillPrice(fills), fillCount: fills.length },
        ip: null,
      });
    }

    if (order.signalId) {
      const signal = await this.repos.signals.findById(order.signalId);
      if (signal && signal.status === "new") await this.repos.signals.update(signal.id, { status: "acted" });
    }
    return final;
  }

  /** Update (or open) the position for a fill and move portfolio cash. */
  private async bookFill(order: Order, fill: Fill, instrument: Instrument, account: BrokerAccount): Promise<void> {
    const existing = await this.repos.positions.findOpen(order.portfolioId, order.instrumentId);
    const at = this.clock.nowIso();
    const { update, effect } = applyFill(existing, fill, instrument.multiplier, at);

    if (existing) {
      await this.repos.positions.update(existing.id, { ...update, updatedAt: at });
    } else {
      const position: Position = {
        id: this.ids.next(ID_PREFIX.position),
        portfolioId: order.portfolioId,
        brokerAccountId: account.id,
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        assetClass: instrument.assetClass,
        quantity: update.quantity,
        averagePrice: update.averagePrice,
        markPrice: update.markPrice,
        // Opened today: day PnL is its whole unrealised PnL until tomorrow's close.
        previousClose: null,
        marketValue: update.marketValue,
        unrealizedPnl: update.unrealizedPnl,
        realizedPnl: update.realizedPnl,
        strategyId: order.strategyId,
        openedAt: at,
        closedAt: update.closedAt,
        createdAt: at,
        updatedAt: at,
      };
      await this.repos.positions.create(position);
    }

    const portfolio = await this.repos.portfolios.findById(order.portfolioId);
    if (!portfolio) return;
    const cash = portfolio.cash + effect.cashDelta;
    const positions = await this.repos.positions.list({ portfolioId: portfolio.id, open: true }, ALL_ROWS);
    const nav = cash + positions.items.reduce((s, p) => s + p.marketValue, 0);
    await this.repos.portfolios.update(portfolio.id, { cash, nav, navAsOf: at });
  }

  /** Exposed for services that need the current UTC day boundary (agent budgets). */
  protected startOfDay(): string {
    return startOfUtcDayIso(this.clock.now());
  }
}
