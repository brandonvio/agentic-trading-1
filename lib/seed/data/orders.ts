/**
 * Order flow across every lifecycle state, with fills for anything that
 * traded. Orders are drawn from the instruments each portfolio actually holds
 * so brokers, mandates and marks stay consistent with the rest of the seed.
 */
import type { Fill, Order, OrderStatus, OrderOrigin, OrderType, RiskCheckResult, TimeInForce } from "@/lib/domain/order";
import type { Actor } from "@/lib/domain/auth";
import type { Position } from "@/lib/domain/portfolio";
import type { AgentRun, Signal } from "@/lib/domain/agent";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, roundToTick, type InstrumentRef, type SeedContext } from "../context";
import type { OrgBundle } from "./org";
import type { PortfolioBundle } from "./portfolios";
import type { InstrumentBundle } from "./instruments";
import type { StrategyBundle } from "./strategies";
import type { AgentBundle } from "./agents";
import type { PositionBundle } from "./positions";
import { commissionFor, notionalUsd, roundQuantity } from "./sizing";

/** How many orders end in each state; sums to 120. */
const STATUS_PLAN: ReadonlyArray<readonly [OrderStatus, number]> = [
  ["FILLED", 62],
  ["PARTIALLY_FILLED", 10],
  ["ACKNOWLEDGED", 14],
  ["ROUTED", 4],
  ["CANCELLED", 12],
  ["RISK_REJECTED", 6],
  ["PENDING_APPROVAL", 6],
  ["APPROVAL_REJECTED", 3],
  ["ERROR", 3],
];

const AGENT_RATIONALES: readonly string[] = [
  "House view moved to lower real yields; adding the duration expression in the most liquid part of the curve while the equity leg is trimmed to keep gross flat.",
  "Signal cleared the conviction threshold at 0.68 with the momentum filter confirming. Sized at the strategy's inverse-ATR weight, which is inside the single-instrument limit.",
  "Rebalancing to the ensemble's target weight after the nightly recomputation; the position had drifted 2.4% past the no-trade band.",
  "Trimming the largest position to clear the single-instrument concentration warning without abandoning the underlying macro theme.",
  "Working the approved parent order in child clips capped at 8% of trailing five-day volume; limit set inside the spread as the parent is not marked urgent.",
  "Delta hedge: the strangle book drifted to a net short delta of 0.61% of NAV, outside the 0.5% tolerance the mandate sets.",
  "Rolling the expiring contract into the next quarterly ahead of the liquidity migration; net position and risk contribution unchanged.",
  "Adding to the core allocation toward its strategic weight after four consecutive weeks at the top of the momentum ranking.",
];

const STRATEGY_RATIONALES: readonly string[] = [
  "Scheduled weekly basket rebalance: leg weights recomputed from carry-to-volatility with the three-month momentum filter applied.",
  "Systematic entry on the 60-day range breakout, sized by inverse ATR and capped by the sleeve risk budget.",
  "Model spread reached the 91st percentile of the trailing year; opening the short-variance leg with the wing purchased first.",
  "Cross-sectional momentum rebalance at the Monday 00:00 UTC cut; the pair moved from the fifth to the second decile.",
  "Probability model diverged from the market price by more than the six-point entry threshold for over thirty minutes.",
];

const MANUAL_RATIONALES: readonly string[] = [
  "Discretionary add on the macro call discussed at the morning meeting; sized to a quarter of the theme's risk budget.",
  "Taking profit on half the position after the target was reached ahead of the horizon.",
  "Reducing exposure into the FOMC print; the book does not need to carry event risk this size.",
  "Client-driven cash raise: liquidating the most liquid leg first to minimise market impact.",
  "Correcting an over-hedge left by the overnight session.",
];

const RISK_RATIONALES: readonly string[] = [
  "Automatic de-risking: the daily loss limit was breached and the risk sentinel is unwinding proportionally across the book.",
  "Hedge requested by the risk sentinel against the single-instrument concentration breach; the future is the most liquid offset.",
  "Margin utilisation crossed 55% of buying power; reducing the highest-margin leg first.",
];

const PASSING_CHECKS: ReadonlyArray<readonly [string, string]> = [
  ["mandate_asset_class", "Instrument asset class is permitted by the portfolio mandate."],
  ["gross_exposure_pct_nav", "Post-trade gross exposure remains inside the portfolio limit."],
  ["order_notional", "Order notional is below the per-order ceiling for this portfolio."],
  ["open_orders_count", "Working order count remains inside the portfolio limit."],
];

interface RejectionSpec {
  rule: string;
  message: string;
  observed: number;
  limit: number;
  reason: string;
}

const REJECTIONS: readonly RejectionSpec[] = [
  { rule: "single_instrument_pct_nav", message: "Post-trade single-instrument exposure would reach 34.8% of NAV against a 15.0% limit.", observed: 0.348, limit: 0.15, reason: "Blocked by risk: single-instrument concentration limit would be breached post-trade." },
  { rule: "order_notional", message: "Order notional of $68.4m exceeds the $50.0m per-order ceiling for this portfolio.", observed: 68_400_000, limit: 50_000_000, reason: "Blocked by risk: order notional exceeds the portfolio's per-order ceiling." },
  { rule: "agent_daily_notional", message: "Agent-originated notional for the day would reach $126.0m against a $100.0m daily budget.", observed: 126_000_000, limit: 100_000_000, reason: "Blocked by risk: the agent's daily notional budget is exhausted." },
  { rule: "gross_exposure_pct_nav", message: "Post-trade gross exposure would reach 4.31x NAV against a 4.00x mandate cap.", observed: 4.31, limit: 4.0, reason: "Blocked by risk: gross leverage would exceed the mandate cap." },
  { rule: "margin_utilization_pct", message: "Post-trade margin utilisation would reach 71.2% of buying power against a 60.0% limit.", observed: 0.712, limit: 0.6, reason: "Blocked by risk: margin utilisation would exceed the account limit." },
  { rule: "daily_loss_pct_nav", message: "Portfolio is down 2.6% on the day against a 2.0% loss limit; risk-increasing orders are blocked.", observed: -0.026, limit: -0.02, reason: "Blocked by risk: the portfolio is beyond its daily loss limit." },
];

const BROKER_ERRORS: readonly string[] = [
  "Broker rejected the order: contract not available for trading in this account's permissions set.",
  "Broker session dropped mid-submission; the order was never acknowledged and has been marked in error for manual review.",
  "Broker rejected the order: price band violation, limit price is more than 5% away from the last trade.",
];

export interface OrderBundle {
  orders: Order[];
  fills: Fill[];
  /** Orders awaiting or refused human approval, in creation order. */
  approvalOrders: Order[];
}

function venueFor(ref: InstrumentRef): string {
  return ref.instrument.venue;
}

function externalId(ctx: SeedContext, broker: string): string {
  const n = ctx.rng.int(1_000_000, 9_999_999);
  const prefix = broker === "ibkr" ? "IB" : broker === "oanda" ? "OA" : broker === "tradovate" ? "TV" : broker === "coinbase" ? "CB" : "KS";
  return `${prefix}-${n}`;
}

export function generateOrders(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  instruments: InstrumentBundle,
  strategies: StrategyBundle,
  agentBundle: AgentBundle,
  positions: PositionBundle,
  runs: readonly AgentRun[],
  signals: readonly Signal[],
): OrderBundle {
  const orders: Order[] = [];
  const fills: Fill[] = [];
  const tradablePortfolios = portfolios.portfolios.filter((p) => p.status === "active");
  const actedSignals = signals.filter((s) => s.status === "acted");
  let signalCursor = 0;

  const plan: OrderStatus[] = [];
  for (const [status, count] of STATUS_PLAN) for (let i = 0; i < count; i++) plan.push(status);
  const shuffled = ctx.rng.shuffle(plan);

  for (const status of shuffled) {
    const portfolio = ctx.rng.pick(tradablePortfolios);
    const open = positions.byPortfolio(portfolio.id);
    if (open.length === 0) continue;
    const position: Position = ctx.rng.pick(open);
    const ref = instruments.refs.get(position.symbol);
    if (!ref) throw new Error(`Seed generation error: order references unknown symbol ${position.symbol}`);
    const account = portfolios.accountFor(portfolio.id, ref.instrument.broker);

    const origin: OrderOrigin = ctx.rng.weighted<OrderOrigin>([
      ["agent", 38],
      ["strategy", 30],
      ["manual", 24],
      ["risk_unwind", 8],
    ]);
    const side = ctx.rng.chance(0.55) ? "BUY" : "SELL";
    const type: OrderType = ctx.rng.weighted<OrderType>([["LIMIT", 60], ["MARKET", 28], ["STOP", 7], ["STOP_LIMIT", 5]]);
    const timeInForce: TimeInForce = type === "MARKET" ? "IOC" : ctx.rng.weighted<TimeInForce>([["DAY", 60], ["GTC", 30], ["FOK", 10]]);
    const quantity = roundQuantity(ref.instrument, Math.abs(position.quantity) * ctx.rng.range(0.05, 0.4));
    const tick = ref.instrument.tickSize;
    const refPrice = roundToTick(ref.price * (1 + ctx.rng.normal(0, 0.004)), tick);
    const limitPrice = type === "LIMIT" || type === "STOP_LIMIT" ? roundToTick(refPrice * (side === "BUY" ? 0.999 : 1.001), tick) : null;
    const stopPrice = type === "STOP" || type === "STOP_LIMIT" ? roundToTick(refPrice * (side === "BUY" ? 1.006 : 0.994), tick) : null;

    const strategyId = origin === "strategy" || origin === "agent" ? position.strategyId : null;
    const trading = agentBundle.agents.filter((a) => a.kind === "execution" || a.kind === "portfolio_manager" || a.kind === "risk_sentinel");
    const scoped = trading.filter((a) => a.portfolioId === portfolio.id);
    // Portfolios without a dedicated crew are traded by a desk agent instead.
    const agentCandidates = scoped.length > 0 ? scoped : trading.filter((a) => a.deskId === portfolio.deskId);
    const pool = agentCandidates.length > 0 ? agentCandidates : trading;
    const agent = origin === "agent" || origin === "risk_unwind" ? ctx.rng.pick(pool) : null;
    const agentRun = agent ? runs.filter((r) => r.agentId === agent.id).slice(-1)[0] ?? null : null;

    let createdBy: Actor;
    if (agent) {
      createdBy = { kind: "agent", id: agent.id, name: agent.name, ...(agentRun ? { runId: agentRun.id } : {}) };
    } else if (origin === "strategy") {
      createdBy = { kind: "system", id: "system", name: "system" };
    } else {
      const desk = portfolio.deskId;
      const candidates = org.users.filter((u) => u.deskIds.includes(desk) && (u.roles.includes("trader") || u.roles.includes("portfolio_manager")));
      const user = candidates.length > 0 ? ctx.rng.pick(candidates) : org.userByEmail("liam.oconnor@agenticprop.io");
      createdBy = { kind: "user", id: user.id, name: user.name };
    }

    const rationalePool = origin === "agent" ? AGENT_RATIONALES : origin === "strategy" ? STRATEGY_RATIONALES : origin === "risk_unwind" ? RISK_RATIONALES : MANUAL_RATIONALES;
    const rationale = ctx.rng.pick(rationalePool);

    let signalId: string | null = null;
    if ((origin === "agent" || origin === "strategy") && actedSignals.length > 0 && ctx.rng.chance(0.5)) {
      const candidate = actedSignals[signalCursor % actedSignals.length];
      signalCursor += 1;
      if (candidate.portfolioId === portfolio.id) signalId = candidate.id;
    }

    const createdAt = ctx.tradingTime(ref.instrument.assetClass, 0.2, 6.5);
    const estimatedNotional = Math.abs(notionalUsd(ref.instrument, limitPrice ?? refPrice, quantity));
    const riskChecks: RiskCheckResult[] = PASSING_CHECKS.map(([rule, message]) => ({ rule, passed: true, message, observed: null, limit: null }));

    let filledQuantity = 0;
    let averageFillPrice: number | null = null;
    let rejectionReason: string | null = null;
    let completedAt: string | null = null;
    let submittedAt: string | null = null;
    let externalOrderId: string | null = null;

    if (status === "RISK_REJECTED") {
      const rejection = ctx.rng.pick(REJECTIONS);
      riskChecks.push({ rule: rejection.rule, passed: false, message: rejection.message, observed: rejection.observed, limit: rejection.limit });
      rejectionReason = rejection.reason;
      completedAt = ctx.shift(createdAt, ctx.rng.int(400, 2_500));
    } else if (status === "APPROVAL_REJECTED") {
      rejectionReason = "Rejected in approval: the requester could not evidence that the position fits the current risk budget.";
      completedAt = ctx.shift(createdAt, ctx.rng.int(9 * 60_000, 90 * 60_000));
    } else if (status === "ERROR") {
      submittedAt = ctx.shift(createdAt, ctx.rng.int(300, 1_800));
      rejectionReason = ctx.rng.pick(BROKER_ERRORS);
      completedAt = ctx.shift(submittedAt, ctx.rng.int(500, 4_000));
    } else if (status !== "PENDING_APPROVAL") {
      submittedAt = ctx.shift(createdAt, ctx.rng.int(300, 2_500));
      externalOrderId = externalId(ctx, ref.instrument.broker);
    }

    const orderId = ctx.ids.next(ID_PREFIX.order);

    if (status === "FILLED" || status === "PARTIALLY_FILLED") {
      const targetQty = status === "FILLED" ? quantity : roundQuantity(ref.instrument, quantity * ctx.rng.range(0.2, 0.7));
      const slices = status === "FILLED" ? ctx.rng.int(1, 3) : ctx.rng.int(1, 2);
      let remaining = targetQty;
      let notionalSum = 0;
      const base = submittedAt ?? createdAt;
      for (let s = 0; s < slices; s++) {
        const isLast = s === slices - 1;
        const qty = isLast ? remaining : roundQuantity(ref.instrument, remaining / (slices - s));
        if (qty <= 0) continue;
        remaining = round(remaining - qty, 6);
        const price = roundToTick(refPrice * (1 + ctx.rng.normal(0, 0.0006)), tick);
        notionalSum += qty * price;
        fills.push({
          id: ctx.ids.next(ID_PREFIX.fill),
          orderId,
          portfolioId: portfolio.id,
          instrumentId: ref.instrument.id,
          symbol: ref.instrument.symbol,
          side,
          quantity: qty,
          price,
          commission: commissionFor(ref.instrument, qty, price),
          externalFillId: `${externalOrderId ?? "X"}-F${s + 1}`,
          venue: venueFor(ref),
          executedAt: ctx.shift(base, ctx.rng.int(800, 240_000) * (s + 1)),
        });
        if (remaining <= 0) break;
      }
      filledQuantity = round(targetQty - Math.max(0, remaining), 6);
      averageFillPrice = filledQuantity > 0 ? round(notionalSum / filledQuantity, 6) : null;
      if (status === "FILLED") completedAt = fills[fills.length - 1]?.executedAt ?? submittedAt;
    } else if (status === "CANCELLED") {
      rejectionReason = ctx.rng.chance(0.4) ? "Cancelled by the execution agent: the spread widened beyond the abort threshold." : "Cancelled by the trader before any fill.";
      completedAt = ctx.shift(submittedAt ?? createdAt, ctx.rng.int(60_000, 5_400_000));
    }

    orders.push({
      id: orderId,
      portfolioId: portfolio.id,
      brokerAccountId: account.id,
      broker: ref.instrument.broker,
      instrumentId: ref.instrument.id,
      symbol: ref.instrument.symbol,
      assetClass: ref.instrument.assetClass,
      side,
      type,
      quantity,
      limitPrice,
      stopPrice,
      timeInForce,
      status,
      origin,
      createdBy,
      strategyId: strategyId ?? (origin === "strategy" ? strategies.strategies[0].id : null),
      signalId,
      agentRunId: agentRun ? agentRun.id : null,
      rationale,
      estimatedNotional,
      filledQuantity,
      averageFillPrice,
      externalOrderId,
      riskChecks,
      approvalId: null,
      rejectionReason,
      submittedAt,
      completedAt,
      createdAt,
      updatedAt: completedAt ?? submittedAt ?? createdAt,
    });
  }

  orders.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const approvalOrders = orders.filter((o) => o.status === "PENDING_APPROVAL" || o.status === "APPROVAL_REJECTED");

  // Publish order ids back onto the runs that originated them.
  for (const run of runs) {
    const produced = orders.filter((o) => o.agentRunId === run.id).map((o) => o.id);
    if (produced.length > 0) run.orderIds = produced;
  }

  return { orders, fills, approvalOrders };
}
