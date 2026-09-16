import { z } from "zod";
import { Timestamped } from "./common";
import { AssetClass } from "./instrument";

export const StrategyStatus = z.enum(["research", "backtested", "paper", "live", "paused", "retired"]);
export type StrategyStatus = z.infer<typeof StrategyStatus>;

export const StrategyStyle = z.enum([
  "momentum",
  "mean_reversion",
  "volatility_arbitrage",
  "carry",
  "trend_following",
  "statistical_arbitrage",
  "event_probability",
  "market_making",
  "macro_discretionary",
]);
export type StrategyStyle = z.infer<typeof StrategyStyle>;

export const StrategyParameters = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));
export type StrategyParameters = z.infer<typeof StrategyParameters>;

export const PerformanceStats = z.object({
  sharpe: z.number(),
  sortino: z.number(),
  annualizedReturnPct: z.number(),
  maxDrawdownPct: z.number(),
  winRatePct: z.number(),
  profitFactor: z.number(),
  tradeCount: z.number().int().nonnegative(),
  asOf: z.string(),
});
export type PerformanceStats = z.infer<typeof PerformanceStats>;

export const Strategy = Timestamped.extend({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  /** Human-readable thesis the LLM agents reason over. */
  thesis: z.string(),
  style: StrategyStyle,
  assetClasses: z.array(AssetClass).min(1),
  /** Instruments in the strategy universe. */
  instrumentIds: z.array(z.string()),
  status: StrategyStatus,
  ownerUserId: z.string(),
  deskId: z.string(),
  /** Portfolios the strategy is deployed to (allocated capital per portfolio). */
  deployments: z.array(
    z.object({
      portfolioId: z.string(),
      allocatedCapital: z.number().nonnegative(),
      deployedAt: z.string(),
    }),
  ),
  parameters: StrategyParameters,
  backtest: PerformanceStats.nullable().default(null),
  live: PerformanceStats.nullable().default(null),
  /** Version bumps every time parameters change. */
  version: z.number().int().positive().default(1),
});
export type Strategy = z.infer<typeof Strategy>;

export const CreateStrategyInput = Strategy.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  live: true,
  backtest: true,
  deployments: true,
}).extend({
  deployments: Strategy.shape.deployments.default([]),
});
export type CreateStrategyInput = z.infer<typeof CreateStrategyInput>;

export const UpdateStrategyInput = CreateStrategyInput.partial();
export type UpdateStrategyInput = z.infer<typeof UpdateStrategyInput>;

export const Backtest = Timestamped.extend({
  id: z.string(),
  strategyId: z.string(),
  requestedByUserId: z.string(),
  from: z.string(),
  to: z.string(),
  initialCapital: z.number().positive(),
  parameters: StrategyParameters,
  status: z.enum(["queued", "running", "completed", "failed"]),
  stats: PerformanceStats.nullable(),
  /** Equity curve as [isoDate, equity] points. */
  equityCurve: z.array(z.tuple([z.string(), z.number()])).default([]),
  summary: z.string().default(""),
});
export type Backtest = z.infer<typeof Backtest>;
