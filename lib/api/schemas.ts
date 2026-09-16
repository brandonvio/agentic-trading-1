/**
 * Query-string and request-body schemas for app/api/** route handlers.
 *
 * Query params always arrive as strings, so anything non-string is coerced
 * here. Body schemas that already exist in lib/domain (CreateOrderInput, …)
 * are reused directly by the routes; only API-specific shapes live here.
 */
import { z } from "zod";
import { RoleKey } from "@/lib/domain/auth";
import { AssetClass, BarInterval, BrokerKey } from "@/lib/domain/instrument";
import { BrokerAccountStatus, PortfolioStatus } from "@/lib/domain/portfolio";
import { OrderFilter, OrderStatus, OrderType } from "@/lib/domain/order";
import { StrategyStatus } from "@/lib/domain/strategy";
import { AgentKind, AgentRunStatus, AgentStatus, SignalStatus } from "@/lib/domain/agent";
import { RiskBreachSeverity, RiskBreachStatus, RiskLimitScope } from "@/lib/domain/risk";
import { ApprovalStatus, ApprovalType } from "@/lib/domain/approval";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** "true" | "false" query flag (z.coerce.boolean treats "false" as true). */
export const BoolQuery = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

/** Comma-separated list, e.g. `?ids=a,b,c`. Empty entries are dropped. */
export const CsvQuery = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );

const NonEmpty = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------
export const LoginBody = z.object({ email: z.string().email() });
export type LoginBody = z.infer<typeof LoginBody>;

export const UserListQuery = z.object({
  deskId: z.string().optional(),
  role: RoleKey.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuery>;

// ---------------------------------------------------------------------------
// Market data & instruments
// ---------------------------------------------------------------------------
export const InstrumentListQuery = z.object({
  assetClass: AssetClass.optional(),
  broker: BrokerKey.optional(),
  search: z.string().optional(),
});
export type InstrumentListQuery = z.infer<typeof InstrumentListQuery>;

export const BarsQuery = z.object({
  interval: BarInterval.default("1d"),
  count: z.coerce.number().int().min(1).max(5000).default(200),
});
export type BarsQuery = z.infer<typeof BarsQuery>;

export const QuotesQuery = z.object({
  ids: CsvQuery.pipe(z.array(z.string()).min(1).max(200)),
});
export type QuotesQuery = z.infer<typeof QuotesQuery>;

// ---------------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------------
export const BrokerAccountListQuery = z.object({
  portfolioId: z.string().optional(),
  broker: BrokerKey.optional(),
});
export type BrokerAccountListQuery = z.infer<typeof BrokerAccountListQuery>;

export const BrokerAccountStatusBody = z.object({ status: BrokerAccountStatus });
export type BrokerAccountStatusBody = z.infer<typeof BrokerAccountStatusBody>;

// ---------------------------------------------------------------------------
// Portfolios & positions
// ---------------------------------------------------------------------------
export const PortfolioListQuery = z.object({
  deskId: z.string().optional(),
  status: PortfolioStatus.optional(),
});
export type PortfolioListQuery = z.infer<typeof PortfolioListQuery>;

export const PortfolioStatusBody = z.object({ status: PortfolioStatus });
export type PortfolioStatusBody = z.infer<typeof PortfolioStatusBody>;

export const PositionListQuery = z.object({
  portfolioId: z.string().optional(),
  assetClass: AssetClass.optional(),
  strategyId: z.string().optional(),
  open: BoolQuery,
});
export type PositionListQuery = z.infer<typeof PositionListQuery>;

export const ClosePositionBody = z.object({ rationale: z.string().default("") });
export type ClosePositionBody = z.infer<typeof ClosePositionBody>;

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
/** OrderFilter as query params; `statuses` is comma-separated. */
export const OrderListQuery = OrderFilter.omit({ statuses: true }).extend({
  statuses: CsvQuery.pipe(z.array(OrderStatus)).optional(),
});
export type OrderListQuery = z.infer<typeof OrderListQuery>;

/** Generic `{ reason }` body for cancel / pause / dismiss / kill. */
export const ReasonBody = z.object({ reason: NonEmpty });
export type ReasonBody = z.infer<typeof ReasonBody>;

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------
export const StrategyListQuery = z.object({
  deskId: z.string().optional(),
  status: StrategyStatus.optional(),
  portfolioId: z.string().optional(),
});
export type StrategyListQuery = z.infer<typeof StrategyListQuery>;

export const DeployStrategyBody = z.object({
  portfolioId: NonEmpty,
  allocatedCapital: z.number().nonnegative(),
  mode: z.enum(["paper", "live"]).default("paper"),
});
export type DeployStrategyBody = z.infer<typeof DeployStrategyBody>;

export const BacktestBody = z.object({
  from: NonEmpty,
  to: NonEmpty,
  initialCapital: z.number().positive(),
});
export type BacktestBody = z.infer<typeof BacktestBody>;

// ---------------------------------------------------------------------------
// Agents, runs, signals
// ---------------------------------------------------------------------------
export const AgentListQuery = z.object({
  kind: AgentKind.optional(),
  portfolioId: z.string().optional(),
  status: AgentStatus.optional(),
});
export type AgentListQuery = z.infer<typeof AgentListQuery>;

export const AgentRunBody = z.object({
  objective: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
export type AgentRunBody = z.infer<typeof AgentRunBody>;

export const AgentRunListQuery = z.object({
  agentId: z.string().optional(),
  portfolioId: z.string().optional(),
  status: AgentRunStatus.optional(),
});
export type AgentRunListQuery = z.infer<typeof AgentRunListQuery>;

export const SignalListQuery = z.object({
  portfolioId: z.string().optional(),
  strategyId: z.string().optional(),
  agentId: z.string().optional(),
  status: SignalStatus.optional(),
  instrumentId: z.string().optional(),
});
export type SignalListQuery = z.infer<typeof SignalListQuery>;

export const SignalActBody = z.object({
  quantity: z.number().positive().optional(),
  type: OrderType.optional(),
  limitPrice: z.number().positive().optional(),
});
export type SignalActBody = z.infer<typeof SignalActBody>;

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------
export const RiskLimitListQuery = z.object({
  scope: RiskLimitScope.optional(),
  scopeId: z.string().optional(),
});
export type RiskLimitListQuery = z.infer<typeof RiskLimitListQuery>;

export const RiskBreachListQuery = z.object({
  portfolioId: z.string().optional(),
  status: RiskBreachStatus.optional(),
  severity: RiskBreachSeverity.optional(),
});
export type RiskBreachListQuery = z.infer<typeof RiskBreachListQuery>;

export const ResolveBreachBody = z.object({ note: z.string().default("") });
export type ResolveBreachBody = z.infer<typeof ResolveBreachBody>;

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
export const ApprovalListQuery = z.object({
  status: ApprovalStatus.optional(),
  type: ApprovalType.optional(),
  portfolioId: z.string().optional(),
});
export type ApprovalListQuery = z.infer<typeof ApprovalListQuery>;
