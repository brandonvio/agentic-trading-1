import { z } from "zod";
import { Side, Timestamped } from "./common";
import { AssetClass, BrokerKey } from "./instrument";
import { Actor } from "./auth";

export const OrderType = z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]);
export type OrderType = z.infer<typeof OrderType>;

export const TimeInForce = z.enum(["DAY", "GTC", "IOC", "FOK"]);
export type TimeInForce = z.infer<typeof TimeInForce>;

/**
 * Order lifecycle:
 *   DRAFT → PENDING_RISK → (RISK_REJECTED | PENDING_APPROVAL | ROUTED)
 *   PENDING_APPROVAL → (APPROVAL_REJECTED | ROUTED)
 *   ROUTED → ACKNOWLEDGED → (PARTIALLY_FILLED)* → FILLED
 *   any live state → CANCELLED (by user/agent/risk) | ERROR (broker)
 */
export const OrderStatus = z.enum([
  "DRAFT",
  "PENDING_RISK",
  "RISK_REJECTED",
  "PENDING_APPROVAL",
  "APPROVAL_REJECTED",
  "ROUTED",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "ERROR",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "RISK_REJECTED",
  "APPROVAL_REJECTED",
  "FILLED",
  "CANCELLED",
  "ERROR",
];

export const LIVE_ORDER_STATUSES: readonly OrderStatus[] = ["ROUTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"];

export const OrderOrigin = z.enum(["manual", "agent", "strategy", "risk_unwind"]);
export type OrderOrigin = z.infer<typeof OrderOrigin>;

export const RiskCheckResult = z.object({
  rule: z.string(),
  passed: z.boolean(),
  message: z.string(),
  /** Observed value vs limit, when applicable. */
  observed: z.number().nullable().default(null),
  limit: z.number().nullable().default(null),
});
export type RiskCheckResult = z.infer<typeof RiskCheckResult>;

export const Order = Timestamped.extend({
  id: z.string(),
  portfolioId: z.string(),
  brokerAccountId: z.string(),
  broker: BrokerKey,
  instrumentId: z.string(),
  symbol: z.string(),
  assetClass: AssetClass,
  side: Side,
  type: OrderType,
  quantity: z.number().positive(),
  limitPrice: z.number().positive().nullable().default(null),
  stopPrice: z.number().positive().nullable().default(null),
  timeInForce: TimeInForce,
  status: OrderStatus,
  origin: OrderOrigin,
  /** Who created the order: user or agent. */
  createdBy: Actor,
  strategyId: z.string().nullable().default(null),
  signalId: z.string().nullable().default(null),
  agentRunId: z.string().nullable().default(null),
  /** Free-text rationale (agents always populate this). */
  rationale: z.string().default(""),
  /** Estimated notional in portfolio base currency at submission time. */
  estimatedNotional: z.number().nonnegative(),
  filledQuantity: z.number().nonnegative().default(0),
  averageFillPrice: z.number().nullable().default(null),
  /** Broker-side order reference once routed. */
  externalOrderId: z.string().nullable().default(null),
  riskChecks: z.array(RiskCheckResult).default([]),
  approvalId: z.string().nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
});
export type Order = z.infer<typeof Order>;

export const CreateOrderInput = z.object({
  portfolioId: z.string(),
  instrumentId: z.string(),
  side: Side,
  type: OrderType.default("MARKET"),
  quantity: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: TimeInForce.default("DAY"),
  rationale: z.string().default(""),
  strategyId: z.string().optional(),
  signalId: z.string().optional(),
  agentRunId: z.string().optional(),
  origin: OrderOrigin.default("manual"),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const Fill = z.object({
  id: z.string(),
  orderId: z.string(),
  portfolioId: z.string(),
  instrumentId: z.string(),
  symbol: z.string(),
  side: Side,
  quantity: z.number().positive(),
  price: z.number().positive(),
  commission: z.number().nonnegative(),
  /** Broker-reported execution id. */
  externalFillId: z.string(),
  venue: z.string(),
  executedAt: z.string(),
});
export type Fill = z.infer<typeof Fill>;

export const OrderFilter = z.object({
  portfolioId: z.string().optional(),
  deskId: z.string().optional(),
  status: OrderStatus.optional(),
  statuses: z.array(OrderStatus).optional(),
  origin: OrderOrigin.optional(),
  instrumentId: z.string().optional(),
  strategyId: z.string().optional(),
  agentRunId: z.string().optional(),
});
export type OrderFilter = z.infer<typeof OrderFilter>;
