/**
 * Order tools. These are the only tools that can reach a venue, so both are
 * closed to advisory agents (`allowAdvisory: false`) and `submit_order` is
 * further restricted to the kinds that are allowed to trade.
 *
 * `submit_order` goes through `OrderService.submitForAgent`, which re-applies
 * autonomy, mandate, approval-threshold and per-run notional checks server
 * side; a risk-rejected or approval-pending order is a normal return value,
 * not an error, and must be reported faithfully.
 */
import { z } from "zod";
import { Side } from "@/lib/domain/common";
import { OrderType, TimeInForce, type Order } from "@/lib/domain/order";
import { defineTool, type ToolDefinition } from "./registry";
import { PortfolioIdInput, resolvePortfolioId } from "./shared";

/** `{ orderId, status, riskChecks, rejectionReason, … }` — result of the full order pipeline. */
export const submitOrder = defineTool({
  name: "submit_order",
  description:
    "Submit an order for the portfolio through the full order pipeline: validation, pre-trade risk, approval routing and broker placement. Returns the resulting order id and status — RISK_REJECTED and PENDING_APPROVAL are normal outcomes and must be reported as they are, never retried at a smaller size to get under a limit. Always supply a rationale naming the signal or decision you are executing and why now.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    instrumentId: z.string().min(1).describe("Instrument to trade."),
    side: Side.describe("BUY or SELL."),
    type: OrderType.default("MARKET").describe("MARKET, LIMIT, STOP or STOP_LIMIT."),
    quantity: z.number().positive().describe("Quantity in instrument units; must be positive."),
    limitPrice: z.number().positive().optional().describe("Required for LIMIT and STOP_LIMIT orders."),
    stopPrice: z.number().positive().optional().describe("Required for STOP and STOP_LIMIT orders."),
    timeInForce: TimeInForce.default("DAY").describe("DAY, GTC, IOC or FOK."),
    signalId: z.string().min(1).optional().describe("Signal this order executes, when there is one."),
    strategyId: z.string().min(1).optional().describe("Strategy the order belongs to, when there is one."),
    rationale: z.string().min(1).max(2000).describe("Which signal or decision this executes, why now and why this order type."),
  }),
  permission: "orders:create",
  kinds: ["execution", "portfolio_manager", "risk_sentinel"],
  allowAdvisory: false,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const order = await ctx.services.orders.submitForAgent(ctx.agent, ctx.run, {
      portfolioId,
      instrumentId: input.instrumentId,
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      limitPrice: input.limitPrice,
      stopPrice: input.stopPrice,
      timeInForce: input.timeInForce,
      rationale: input.rationale,
      signalId: input.signalId,
      strategyId: input.strategyId,
      agentRunId: ctx.run.id,
      origin: "agent",
    });
    ctx.created.orderIds.push(order.id);
    return summarizeOrder(order);
  },
});

/** `{ orderId, status, … }` — result of a cancellation attempt. */
export const cancelOrder = defineTool({
  name: "cancel_order",
  description:
    "Cancel a working order that is stale, superseded or no longer justified. Give a specific reason; it is recorded on the audit trail. Orders that are already terminal (filled, rejected, cancelled) cannot be cancelled and will return an error you should accept rather than retry.",
  schema: z.object({
    orderId: z.string().min(1).describe("Order to cancel."),
    reason: z.string().min(1).max(500).describe("Why the order is being pulled."),
  }),
  permission: "orders:cancel",
  allowAdvisory: false,
  async execute(input, ctx) {
    const order = await ctx.services.orders.cancel(ctx.principal, input.orderId, input.reason);
    return summarizeOrder(order);
  },
});

function summarizeOrder(o: Order): Record<string, unknown> {
  return {
    orderId: o.id,
    status: o.status,
    portfolioId: o.portfolioId,
    instrumentId: o.instrumentId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    quantity: o.quantity,
    filledQuantity: o.filledQuantity,
    averageFillPrice: o.averageFillPrice,
    estimatedNotional: o.estimatedNotional,
    signalId: o.signalId,
    approvalId: o.approvalId,
    riskChecks: o.riskChecks,
    rejectionReason: o.rejectionReason,
  };
}

export const TRADING_TOOLS: readonly ToolDefinition[] = [submitOrder, cancelOrder];
