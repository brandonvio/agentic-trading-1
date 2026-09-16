/**
 * Service composition root.
 *
 * `registerServices(c)` binds every application-service token. Dependencies are
 * resolved lazily inside factories so registration order does not matter and
 * cycles (OrderService ⇄ ApprovalService) resolve on first use rather than at
 * wiring time. Approval outcome handlers are attached once, on first resolve of
 * the approval service, via `wireApprovalHandlers`.
 */
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { PortfolioScope } from "./authz";
import { AuditServiceImpl } from "./audit.service";
import { AuthServiceImpl } from "./auth.service";
import { UserServiceImpl } from "./user.service";
import { DeskServiceImpl } from "./desk.service";
import { MarketDataServiceImpl } from "./market-data.service";
import { BrokerServiceImpl } from "./broker.service";
import { PortfolioServiceImpl } from "./portfolio.service";
import { RiskServiceImpl } from "./risk.service";
import { ApprovalServiceImpl } from "./approval.service";
import { OrderServiceImpl } from "./order.service";
import { StrategyServiceImpl } from "./strategy.service";
import { registerAgentServices } from "@/lib/agents";

/** Token for the shared portfolio-visibility helper, internal to the service layer. */
const scopeCache = new WeakMap<Container, PortfolioScope>();

function scopeOf(c: Container): PortfolioScope {
  let scope = scopeCache.get(c);
  if (!scope) {
    scope = new PortfolioScope(c.resolve(TOKENS.repos).portfolios);
    scopeCache.set(c, scope);
  }
  return scope;
}

/** Approval handlers are attached exactly once per container. */
const wired = new WeakSet<Container>();

function wireApprovalHandlers(c: Container, approvals: ApprovalServiceImpl): void {
  if (wired.has(c)) return;
  wired.add(c);

  approvals.onDecided("order", async (approval, approved, decidedBy, note) => {
    await c.resolve(TOKENS.orderService).onApprovalDecided(approval.subjectId, approved, decidedBy, note);
  });

  approvals.onDecided("strategy_deploy", async (approval, approved, decidedBy, note) => {
    const strategies = c.resolve(TOKENS.strategyService);
    if (strategies instanceof StrategyServiceImpl) {
      await strategies.finalizeDeployment(approval, approved, decidedBy, note);
    }
  });
}

/**
 * Bind every application service. Requires TOKENS.repos, TOKENS.brokers,
 * TOKENS.llm, TOKENS.clock, TOKENS.ids and TOKENS.logger to be registered
 * first (see lib/container.ts).
 */
export function registerServices(c: Container): void {
  c.register(TOKENS.auditService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new AuditServiceImpl(repos.audit, scopeOf(cc), cc.resolve(TOKENS.clock), cc.resolve(TOKENS.ids));
  });

  c.register(TOKENS.authService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new AuthServiceImpl(repos.users, cc.resolve(TOKENS.auditService), cc.resolve(TOKENS.clock));
  });

  c.register(TOKENS.userService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new UserServiceImpl(repos.users, repos.roles, cc.resolve(TOKENS.auditService), cc.resolve(TOKENS.clock), cc.resolve(TOKENS.ids));
  });

  c.register(TOKENS.deskService, (cc) => new DeskServiceImpl(cc.resolve(TOKENS.repos).desks));

  c.register(TOKENS.marketDataService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new MarketDataServiceImpl(repos.instruments, cc.resolve(TOKENS.brokers), cc.resolve(TOKENS.clock));
  });

  c.register(TOKENS.brokerService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new BrokerServiceImpl(
      repos.brokerAccounts,
      cc.resolve(TOKENS.brokers),
      scopeOf(cc),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
    );
  });

  c.register(TOKENS.portfolioService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new PortfolioServiceImpl(
      repos,
      cc.resolve(TOKENS.brokers),
      scopeOf(cc),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
      cc.resolve(TOKENS.logger),
    );
  });

  c.register(TOKENS.riskService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new RiskServiceImpl(
      repos,
      scopeOf(cc),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
      cc.resolve(TOKENS.ids),
      cc.resolve(TOKENS.logger),
    );
  });

  c.register(TOKENS.approvalService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    const approvals = new ApprovalServiceImpl(
      repos.approvals,
      scopeOf(cc),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
      cc.resolve(TOKENS.ids),
      cc.resolve(TOKENS.logger),
    );
    wireApprovalHandlers(cc, approvals);
    return approvals;
  });

  c.register(TOKENS.orderService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new OrderServiceImpl(
      repos,
      cc.resolve(TOKENS.brokers),
      scopeOf(cc),
      cc.resolve(TOKENS.riskService),
      cc.resolve(TOKENS.approvalService),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
      cc.resolve(TOKENS.ids),
      cc.resolve(TOKENS.logger),
    );
  });

  c.register(TOKENS.strategyService, (cc) => {
    const repos = cc.resolve(TOKENS.repos);
    return new StrategyServiceImpl(
      repos,
      scopeOf(cc),
      cc.resolve(TOKENS.approvalService),
      cc.resolve(TOKENS.auditService),
      cc.resolve(TOKENS.clock),
      cc.resolve(TOKENS.ids),
      cc.resolve(TOKENS.logger),
    );
  });

  // Agent + signal services live in lib/agents because they own the runtime.
  registerAgentServices(c);
}

export { PortfolioScope, requirePermission, requireAnyPermission, assertDeskVisible, visibleDeskIds, actorOf, ALL_ROWS } from "./authz";
export { AuditServiceImpl } from "./audit.service";
export { AuthServiceImpl } from "./auth.service";
export { UserServiceImpl } from "./user.service";
export { DeskServiceImpl } from "./desk.service";
export { MarketDataServiceImpl } from "./market-data.service";
export { BrokerServiceImpl } from "./broker.service";
export { PortfolioServiceImpl } from "./portfolio.service";
export { RiskServiceImpl } from "./risk.service";
export { ApprovalServiceImpl } from "./approval.service";
export type { ApprovalOutcomeHandler } from "./approval.service";
export { OrderServiceImpl } from "./order.service";
export { StrategyServiceImpl } from "./strategy.service";
export * from "./interfaces";
