/**
 * Read-only portfolio, position, risk and order-book tools. All of them are
 * scoped to the agent's own portfolio (see `resolvePortfolioId`).
 */
import { z } from "zod";
import { AssetClass } from "@/lib/domain/instrument";
import type { Order } from "@/lib/domain/order";
import type { Position } from "@/lib/domain/portfolio";
import { defineTool, type ToolDefinition } from "./registry";
import { PortfolioIdInput, resolvePortfolioId } from "./shared";

const OPEN_ORDER_STATUSES: Order["status"][] = ["PENDING_RISK", "PENDING_APPROVAL", "ROUTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"];

/** `{ nav, cash, grossExposure, …, portfolio }` — the current state of the book. */
export const getPortfolioSnapshot = defineTool({
  name: "get_portfolio_snapshot",
  description:
    "Return the current snapshot of a portfolio: NAV, cash, gross/net exposure, gross leverage, realised and unrealised PnL, day PnL, inception-to-date return, position count, exposure split by asset class and the largest concentration — together with the portfolio's mandate (allowed asset classes, max leverage, max concentration, agent trading flags). Read this before sizing anything so you do not duplicate exposure the book already has.",
  schema: z.object({ portfolioId: PortfolioIdInput }),
  permission: "portfolios:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const snapshot = await ctx.services.portfolios.snapshot(ctx.principal, portfolioId);
    const portfolio = await ctx.services.portfolios.get(ctx.principal, portfolioId);
    return {
      ...snapshot,
      portfolio: {
        id: portfolio.id,
        code: portfolio.code,
        name: portfolio.name,
        baseCurrency: portfolio.baseCurrency,
        status: portfolio.status,
        mandate: portfolio.mandate,
      },
    };
  },
});

/** `{ positions, total }` — open (or all) positions in the portfolio. */
export const listPositions = defineTool({
  name: "list_positions",
  description:
    "List the portfolio's positions with signed quantity, average price, mark price, market value and realised/unrealised PnL. Defaults to open positions only. Use it to see what exposure already exists before proposing or sizing a new one.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    open: z.boolean().default(true).describe("True for open positions only; false to include closed ones."),
    assetClass: AssetClass.optional().describe("Restrict to one asset class."),
    limit: z.number().int().min(1).max(200).default(100).describe("Maximum positions to return."),
  }),
  permission: "positions:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const page = await ctx.services.portfolios.listPositions(
      ctx.principal,
      { portfolioId, open: input.open, assetClass: input.assetClass },
      { limit: input.limit, offset: 0 },
    );
    return { portfolioId, total: page.total, positions: page.items.map(summarizePosition) };
  },
});

/** The full `RiskReport`: metrics plus per-limit observed / utilisation / status. */
export const getRiskReport = defineTool({
  name: "get_risk_report",
  description:
    "Return the portfolio risk report: NAV, gross and net exposure as a fraction of NAV, 95% VaR, day loss, drawdown, margin utilisation, the largest position, and every applicable risk limit with its observed value, utilisation percentage and status (ok | warning | breached). Treat a breached limit as the highest-priority item in the run.",
  schema: z.object({ portfolioId: PortfolioIdInput }),
  permission: "risk:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    return ctx.services.risk.report(ctx.principal, portfolioId);
  },
});

/** `{ orders, total }` — orders that are still working. */
export const listOpenOrders = defineTool({
  name: "list_open_orders",
  description:
    "List orders in the portfolio that are still working (pending risk, pending approval, routed, acknowledged or partially filled), including side, quantity, filled quantity, status, origin, the originating signal and the rationale recorded with the order. Check this before submitting so you do not stack duplicate exposure.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum orders to return."),
  }),
  permission: "orders:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const page = await ctx.services.orders.list(ctx.principal, { portfolioId, statuses: OPEN_ORDER_STATUSES }, { limit: input.limit, offset: 0 });
    return { portfolioId, total: page.total, orders: page.items.map(summarizeOrder) };
  },
});

function summarizePosition(p: Position): Record<string, unknown> {
  return {
    id: p.id,
    instrumentId: p.instrumentId,
    symbol: p.symbol,
    assetClass: p.assetClass,
    quantity: p.quantity,
    averagePrice: p.averagePrice,
    markPrice: p.markPrice,
    marketValue: p.marketValue,
    unrealizedPnl: p.unrealizedPnl,
    realizedPnl: p.realizedPnl,
    strategyId: p.strategyId,
    openedAt: p.openedAt,
  };
}

function summarizeOrder(o: Order): Record<string, unknown> {
  return {
    id: o.id,
    instrumentId: o.instrumentId,
    symbol: o.symbol,
    assetClass: o.assetClass,
    side: o.side,
    type: o.type,
    quantity: o.quantity,
    filledQuantity: o.filledQuantity,
    limitPrice: o.limitPrice,
    status: o.status,
    origin: o.origin,
    estimatedNotional: o.estimatedNotional,
    signalId: o.signalId,
    strategyId: o.strategyId,
    agentRunId: o.agentRunId,
    rationale: o.rationale,
    createdAt: o.createdAt,
  };
}

export const PORTFOLIO_TOOLS: readonly ToolDefinition[] = [getPortfolioSnapshot, listPositions, getRiskReport, listOpenOrders];
