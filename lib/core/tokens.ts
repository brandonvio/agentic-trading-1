/**
 * DI tokens. Composition root: lib/container.ts.
 * Workstreams register implementations for these tokens; consumers resolve them.
 */
import { token } from "./container";
import type { Clock } from "./clock";
import type { IdGenerator } from "./ids";
import type { Logger } from "./logger";
import type { Repositories, RepositoryAdmin } from "@/lib/repositories/interfaces";
import type { BrokerRegistry } from "@/lib/brokers/types";
import type { LLMProvider } from "@/lib/llm/types";
import type {
  AuthService,
  UserService,
  DeskService,
  MarketDataService,
  BrokerService,
  PortfolioService,
  OrderService,
  RiskService,
  ApprovalService,
  StrategyService,
  AgentService,
  SignalService,
  AuditService,
} from "@/lib/services/interfaces";

export const TOKENS = {
  clock: token<Clock>("Clock"),
  ids: token<IdGenerator>("IdGenerator"),
  logger: token<Logger>("Logger"),
  repos: token<Repositories>("Repositories"),
  repoAdmin: token<RepositoryAdmin>("RepositoryAdmin"),
  brokers: token<BrokerRegistry>("BrokerRegistry"),
  llm: token<LLMProvider>("LLMProvider"),

  authService: token<AuthService>("AuthService"),
  userService: token<UserService>("UserService"),
  deskService: token<DeskService>("DeskService"),
  marketDataService: token<MarketDataService>("MarketDataService"),
  brokerService: token<BrokerService>("BrokerService"),
  portfolioService: token<PortfolioService>("PortfolioService"),
  orderService: token<OrderService>("OrderService"),
  riskService: token<RiskService>("RiskService"),
  approvalService: token<ApprovalService>("ApprovalService"),
  strategyService: token<StrategyService>("StrategyService"),
  agentService: token<AgentService>("AgentService"),
  signalService: token<SignalService>("SignalService"),
  auditService: token<AuditService>("AuditService"),
} as const;
