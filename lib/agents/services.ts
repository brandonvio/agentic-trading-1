/**
 * The subset of application services the agent layer depends on. Resolved
 * lazily (via `ServicesAccessor`) so the agent services can be registered
 * before the services they call on, and so no import cycle forms with the
 * composition root.
 */
import type {
  ApprovalService,
  AuditService,
  MarketDataService,
  OrderService,
  PortfolioService,
  RiskService,
  StrategyService,
} from "@/lib/services/interfaces";

export interface AgentServices {
  market: MarketDataService;
  portfolios: PortfolioService;
  orders: OrderService;
  risk: RiskService;
  strategies: StrategyService;
  approvals: ApprovalService;
  audit: AuditService;
}

/** Lazy accessor; invoked at call time, never at construction time. */
export type ServicesAccessor = () => AgentServices;
