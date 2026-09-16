import { z } from "zod";
import { Currency, Timestamped } from "./common";
import { AssetClass, BrokerKey } from "./instrument";

export const PortfolioStatus = z.enum(["active", "frozen", "liquidating", "closed"]);
export type PortfolioStatus = z.infer<typeof PortfolioStatus>;

export const PortfolioMandate = z.object({
  /** Allowed asset classes. */
  assetClasses: z.array(AssetClass),
  /** Max gross exposure as a multiple of NAV (e.g. 3 = 300%). */
  maxGrossLeverage: z.number().positive(),
  /** Max single-name / single-instrument concentration as fraction of NAV. */
  maxConcentration: z.number().positive().max(1),
  /** Whether autonomous agents may submit orders directly (subject to approval thresholds). */
  agentTradingEnabled: z.boolean(),
  /** Notional above which agent-originated orders require human approval. */
  agentApprovalThresholdNotional: z.number().nonnegative(),
});
export type PortfolioMandate = z.infer<typeof PortfolioMandate>;

export const Portfolio = Timestamped.extend({
  id: z.string(),
  deskId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  baseCurrency: Currency,
  status: PortfolioStatus,
  managerUserId: z.string(),
  /** Net asset value in base currency, as of `navAsOf`. */
  nav: z.number(),
  navAsOf: z.string(),
  /** Starting capital used for inception-to-date return. */
  inceptionCapital: z.number().positive(),
  cash: z.number(),
  mandate: PortfolioMandate,
});
export type Portfolio = z.infer<typeof Portfolio>;

export const CreatePortfolioInput = Portfolio.omit({ id: true, createdAt: true, updatedAt: true });
export type CreatePortfolioInput = z.infer<typeof CreatePortfolioInput>;

export const BrokerAccountStatus = z.enum(["connected", "degraded", "disconnected", "paper"]);
export type BrokerAccountStatus = z.infer<typeof BrokerAccountStatus>;

export const BrokerAccount = Timestamped.extend({
  id: z.string(),
  portfolioId: z.string(),
  broker: BrokerKey,
  /** Broker-side account identifier (mocked). */
  externalAccountId: z.string(),
  label: z.string(),
  currency: Currency,
  status: BrokerAccountStatus,
  cashBalance: z.number(),
  buyingPower: z.number(),
  marginUsed: z.number().nonnegative(),
  lastHeartbeatAt: z.string().nullable(),
});
export type BrokerAccount = z.infer<typeof BrokerAccount>;

export const CreateBrokerAccountInput = BrokerAccount.omit({ id: true, createdAt: true, updatedAt: true });
export type CreateBrokerAccountInput = z.infer<typeof CreateBrokerAccountInput>;

export const Position = Timestamped.extend({
  id: z.string(),
  portfolioId: z.string(),
  brokerAccountId: z.string(),
  instrumentId: z.string(),
  symbol: z.string(),
  assetClass: AssetClass,
  /** Signed quantity: positive long, negative short. */
  quantity: z.number(),
  averagePrice: z.number(),
  markPrice: z.number(),
  /**
   * Prior session close for the instrument, used to attribute day PnL on
   * positions opened before today. Null when unknown (falls back to the
   * open-today heuristic in helpers/portfolio-math.ts).
   */
  previousClose: z.number().nullable().default(null),
  /** Market value in portfolio base currency (quantity * mark * multiplier * fx). */
  marketValue: z.number(),
  unrealizedPnl: z.number(),
  realizedPnl: z.number(),
  /** Strategy that opened/owns the position, if any. */
  strategyId: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable().default(null),
});
export type Position = z.infer<typeof Position>;

export const CreatePositionInput = Position.omit({ id: true, createdAt: true, updatedAt: true });
export type CreatePositionInput = z.infer<typeof CreatePositionInput>;

/** Snapshot metrics derived from positions; not persisted, computed by PortfolioService. */
export interface PortfolioSnapshot {
  portfolioId: string;
  asOf: string;
  nav: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  grossLeverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dayPnl: number;
  inceptionReturnPct: number;
  positionCount: number;
  exposureByAssetClass: Record<AssetClass, number>;
  topConcentration: { symbol: string; pctOfNav: number } | null;
}
