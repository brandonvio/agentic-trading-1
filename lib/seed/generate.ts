/**
 * Deterministic seed dataset.
 *
 * `generateSeedData()` composes every data module in dependency order through a
 * single `SeedContext`, so the same options always produce byte-identical data.
 * `validateSeedData()` re-parses every entity with its zod schema and checks
 * that every foreign id resolves.
 */
import { z } from "zod";
import type { Role, User } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { Bar, Instrument } from "@/lib/domain/instrument";
import type { BrokerAccount, Portfolio, Position } from "@/lib/domain/portfolio";
import type { Backtest, Strategy } from "@/lib/domain/strategy";
import type { Agent, AgentRun, AgentStep, Signal } from "@/lib/domain/agent";
import type { Fill, Order } from "@/lib/domain/order";
import type { RiskBreach, RiskLimit } from "@/lib/domain/risk";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { AuditEvent } from "@/lib/domain/audit";
import {
  Role as RoleSchema,
  User as UserSchema,
  Desk as DeskSchema,
  Instrument as InstrumentSchema,
  Bar as BarSchema,
  Portfolio as PortfolioSchema,
  BrokerAccount as BrokerAccountSchema,
  Position as PositionSchema,
  Strategy as StrategySchema,
  Backtest as BacktestSchema,
  Agent as AgentSchema,
  AgentRun as AgentRunSchema,
  AgentStep as AgentStepSchema,
  Signal as SignalSchema,
  Order as OrderSchema,
  Fill as FillSchema,
  RiskLimit as RiskLimitSchema,
  RiskBreach as RiskBreachSchema,
  ApprovalRequest as ApprovalSchema,
  AuditEvent as AuditEventSchema,
} from "@/lib/domain";
import { SeedContext } from "./context";
import { generateOrg } from "./data/org";
import { generateInstruments } from "./data/instruments";
import { generateBars } from "./data/bars";
import { generatePortfolios } from "./data/portfolios";
import { generateStrategies } from "./data/strategies";
import { generatePositions } from "./data/positions";
import { generateAgents } from "./data/agents";
import { generateAgentActivity } from "./data/agent-runs";
import { generateSignals } from "./data/signals";
import { generateRiskEvents, generateRiskLimits } from "./data/risk";
import { generateOrders } from "./data/orders";
import { generateAuditEvents } from "./data/audit";

/** The instant the dataset is anchored to. Fixed so runs are reproducible. */
export const DEFAULT_SEED_NOW = new Date("2026-09-03T14:30:00.000Z");
export const DEFAULT_SEED = 20_260_903;

export interface SeedData {
  roles: Role[];
  users: User[];
  desks: Desk[];
  instruments: Instrument[];
  dailyBars: Bar[];
  hourlyBars: Bar[];
  portfolios: Portfolio[];
  brokerAccounts: BrokerAccount[];
  positions: Position[];
  strategies: Strategy[];
  backtests: Backtest[];
  agents: Agent[];
  agentRuns: AgentRun[];
  agentSteps: AgentStep[];
  signals: Signal[];
  orders: Order[];
  fills: Fill[];
  riskLimits: RiskLimit[];
  riskBreaches: RiskBreach[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
}

export interface GenerateSeedOptions {
  now?: Date;
  seed?: number;
}

export function generateSeedData(opts: GenerateSeedOptions = {}): SeedData {
  const ctx = new SeedContext({ now: opts.now ?? DEFAULT_SEED_NOW, seed: opts.seed ?? DEFAULT_SEED });

  const org = generateOrg(ctx);
  const instruments = generateInstruments(ctx);
  const bars = generateBars(ctx, instruments);
  const portfolios = generatePortfolios(ctx, org);
  const strategies = generateStrategies(ctx, org, portfolios, instruments);
  const positions = generatePositions(ctx, portfolios, instruments, strategies, bars);
  const agents = generateAgents(ctx, org, portfolios, strategies);
  const activity = generateAgentActivity(ctx, org, portfolios, agents);
  const signals = generateSignals(ctx, portfolios, instruments, strategies, agents, activity.runs);
  const riskLimits = generateRiskLimits(ctx, org, portfolios, agents);
  const orders = generateOrders(ctx, org, portfolios, instruments, strategies, agents, positions, activity.runs, signals.signals);
  const riskEvents = generateRiskEvents(ctx, org, portfolios, strategies, agents, riskLimits, orders.orders);
  const auditEvents = generateAuditEvents(ctx, org, portfolios, strategies, agents, {
    runs: activity.runs,
    signals: signals.signals,
    orders: orders.orders,
    breaches: riskEvents.breaches,
    approvals: riskEvents.approvals,
    limits: riskLimits.limits,
  });

  return {
    roles: org.roles,
    users: org.users,
    desks: org.desks,
    instruments: instruments.instruments,
    dailyBars: bars.daily,
    hourlyBars: bars.hourly,
    portfolios: portfolios.portfolios,
    brokerAccounts: portfolios.brokerAccounts,
    positions: positions.positions,
    strategies: strategies.strategies,
    backtests: strategies.backtests,
    agents: agents.agents,
    agentRuns: activity.runs,
    agentSteps: activity.steps,
    signals: signals.signals,
    orders: orders.orders,
    fills: orders.fills,
    riskLimits: riskLimits.limits,
    riskBreaches: riskEvents.breaches,
    approvals: riskEvents.approvals,
    auditEvents,
  };
}

/** Entity counts, in write order. Used by the seed script's summary table. */
export function seedCounts(data: SeedData): Record<string, number> {
  return {
    roles: data.roles.length,
    users: data.users.length,
    desks: data.desks.length,
    instruments: data.instruments.length,
    dailyBars: data.dailyBars.length,
    hourlyBars: data.hourlyBars.length,
    portfolios: data.portfolios.length,
    brokerAccounts: data.brokerAccounts.length,
    positions: data.positions.length,
    strategies: data.strategies.length,
    backtests: data.backtests.length,
    agents: data.agents.length,
    agentRuns: data.agentRuns.length,
    agentSteps: data.agentSteps.length,
    signals: data.signals.length,
    orders: data.orders.length,
    fills: data.fills.length,
    riskLimits: data.riskLimits.length,
    riskBreaches: data.riskBreaches.length,
    approvals: data.approvals.length,
    auditEvents: data.auditEvents.length,
  };
}

export class SeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedValidationError";
  }
}

function parseAll<T>(entity: string, schema: z.ZodType<T>, items: readonly T[]): void {
  items.forEach((item, i) => {
    const result = schema.safeParse(item);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".") || "(root)";
      throw new SeedValidationError(`${entity}[${i}] failed schema validation at field '${field}': ${issue.message}`);
    }
  });
}

interface RefCheck {
  entity: string;
  field: string;
  /** [ownerId, referencedId] pairs; null referenced ids are skipped. */
  pairs: Array<readonly [string, string | null | undefined]>;
  target: string;
  ids: Set<string>;
}

function checkRefs(checks: readonly RefCheck[]): void {
  for (const check of checks) {
    for (const [ownerId, refId] of check.pairs) {
      if (refId === null || refId === undefined) continue;
      if (!check.ids.has(refId)) {
        throw new SeedValidationError(
          `${check.entity} ${ownerId} has a dangling reference in field '${check.field}': no ${check.target} with id '${refId}'`,
        );
      }
    }
  }
}

const idsOf = (items: ReadonlyArray<{ id: string }>): Set<string> => new Set(items.map((i) => i.id));

/** Throws SeedValidationError naming the offending entity and field. */
export function validateSeedData(data: SeedData): void {
  parseAll("roles", RoleSchema, data.roles);
  parseAll("users", UserSchema, data.users);
  parseAll("desks", DeskSchema, data.desks);
  parseAll("instruments", InstrumentSchema, data.instruments);
  parseAll("dailyBars", BarSchema, data.dailyBars);
  parseAll("hourlyBars", BarSchema, data.hourlyBars);
  parseAll("portfolios", PortfolioSchema, data.portfolios);
  parseAll("brokerAccounts", BrokerAccountSchema, data.brokerAccounts);
  parseAll("positions", PositionSchema, data.positions);
  parseAll("strategies", StrategySchema, data.strategies);
  parseAll("backtests", BacktestSchema, data.backtests);
  parseAll("agents", AgentSchema, data.agents);
  parseAll("agentRuns", AgentRunSchema, data.agentRuns);
  parseAll("agentSteps", AgentStepSchema, data.agentSteps);
  parseAll("signals", SignalSchema, data.signals);
  parseAll("orders", OrderSchema, data.orders);
  parseAll("fills", FillSchema, data.fills);
  parseAll("riskLimits", RiskLimitSchema, data.riskLimits);
  parseAll("riskBreaches", RiskBreachSchema, data.riskBreaches);
  parseAll("approvals", ApprovalSchema, data.approvals);
  parseAll("auditEvents", AuditEventSchema, data.auditEvents);

  const users = idsOf(data.users);
  const desks = idsOf(data.desks);
  const instruments = idsOf(data.instruments);
  const portfolios = idsOf(data.portfolios);
  const accounts = idsOf(data.brokerAccounts);
  const strategies = idsOf(data.strategies);
  const agents = idsOf(data.agents);
  const runs = idsOf(data.agentRuns);
  const signals = idsOf(data.signals);
  const orders = idsOf(data.orders);
  const limits = idsOf(data.riskLimits);
  const approvals = idsOf(data.approvals);

  checkRefs([
    { entity: "user", field: "deskIds", target: "desk", ids: desks, pairs: data.users.flatMap((u) => u.deskIds.map((d) => [u.id, d] as const)) },
    { entity: "desk", field: "headUserId", target: "user", ids: users, pairs: data.desks.map((d) => [d.id, d.headUserId] as const) },
    { entity: "portfolio", field: "deskId", target: "desk", ids: desks, pairs: data.portfolios.map((p) => [p.id, p.deskId] as const) },
    { entity: "portfolio", field: "managerUserId", target: "user", ids: users, pairs: data.portfolios.map((p) => [p.id, p.managerUserId] as const) },
    { entity: "brokerAccount", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.brokerAccounts.map((a) => [a.id, a.portfolioId] as const) },
    { entity: "bar", field: "instrumentId", target: "instrument", ids: instruments, pairs: [...data.dailyBars, ...data.hourlyBars].map((b) => [`${b.instrumentId}@${b.time}`, b.instrumentId] as const) },
    { entity: "position", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.positions.map((p) => [p.id, p.portfolioId] as const) },
    { entity: "position", field: "brokerAccountId", target: "brokerAccount", ids: accounts, pairs: data.positions.map((p) => [p.id, p.brokerAccountId] as const) },
    { entity: "position", field: "instrumentId", target: "instrument", ids: instruments, pairs: data.positions.map((p) => [p.id, p.instrumentId] as const) },
    { entity: "position", field: "strategyId", target: "strategy", ids: strategies, pairs: data.positions.map((p) => [p.id, p.strategyId] as const) },
    { entity: "strategy", field: "ownerUserId", target: "user", ids: users, pairs: data.strategies.map((s) => [s.id, s.ownerUserId] as const) },
    { entity: "strategy", field: "deskId", target: "desk", ids: desks, pairs: data.strategies.map((s) => [s.id, s.deskId] as const) },
    { entity: "strategy", field: "instrumentIds", target: "instrument", ids: instruments, pairs: data.strategies.flatMap((s) => s.instrumentIds.map((i) => [s.id, i] as const)) },
    { entity: "strategy", field: "deployments.portfolioId", target: "portfolio", ids: portfolios, pairs: data.strategies.flatMap((s) => s.deployments.map((d) => [s.id, d.portfolioId] as const)) },
    { entity: "backtest", field: "strategyId", target: "strategy", ids: strategies, pairs: data.backtests.map((b) => [b.id, b.strategyId] as const) },
    { entity: "backtest", field: "requestedByUserId", target: "user", ids: users, pairs: data.backtests.map((b) => [b.id, b.requestedByUserId] as const) },
    { entity: "agent", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.agents.map((a) => [a.id, a.portfolioId] as const) },
    { entity: "agent", field: "deskId", target: "desk", ids: desks, pairs: data.agents.map((a) => [a.id, a.deskId] as const) },
    { entity: "agent", field: "ownerUserId", target: "user", ids: users, pairs: data.agents.map((a) => [a.id, a.ownerUserId] as const) },
    { entity: "agent", field: "strategyIds", target: "strategy", ids: strategies, pairs: data.agents.flatMap((a) => a.strategyIds.map((s) => [a.id, s] as const)) },
    { entity: "agent", field: "lastRunId", target: "agentRun", ids: runs, pairs: data.agents.map((a) => [a.id, a.lastRunId] as const) },
    { entity: "agentRun", field: "agentId", target: "agent", ids: agents, pairs: data.agentRuns.map((r) => [r.id, r.agentId] as const) },
    { entity: "agentRun", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.agentRuns.map((r) => [r.id, r.portfolioId] as const) },
    { entity: "agentRun", field: "signalIds", target: "signal", ids: signals, pairs: data.agentRuns.flatMap((r) => r.signalIds.map((s) => [r.id, s] as const)) },
    { entity: "agentRun", field: "orderIds", target: "order", ids: orders, pairs: data.agentRuns.flatMap((r) => r.orderIds.map((o) => [r.id, o] as const)) },
    { entity: "agentStep", field: "runId", target: "agentRun", ids: runs, pairs: data.agentSteps.map((s) => [s.id, s.runId] as const) },
    { entity: "signal", field: "instrumentId", target: "instrument", ids: instruments, pairs: data.signals.map((s) => [s.id, s.instrumentId] as const) },
    { entity: "signal", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.signals.map((s) => [s.id, s.portfolioId] as const) },
    { entity: "signal", field: "strategyId", target: "strategy", ids: strategies, pairs: data.signals.map((s) => [s.id, s.strategyId] as const) },
    { entity: "signal", field: "agentId", target: "agent", ids: agents, pairs: data.signals.map((s) => [s.id, s.agentId] as const) },
    { entity: "signal", field: "runId", target: "agentRun", ids: runs, pairs: data.signals.map((s) => [s.id, s.runId] as const) },
    { entity: "order", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.orders.map((o) => [o.id, o.portfolioId] as const) },
    { entity: "order", field: "brokerAccountId", target: "brokerAccount", ids: accounts, pairs: data.orders.map((o) => [o.id, o.brokerAccountId] as const) },
    { entity: "order", field: "instrumentId", target: "instrument", ids: instruments, pairs: data.orders.map((o) => [o.id, o.instrumentId] as const) },
    { entity: "order", field: "strategyId", target: "strategy", ids: strategies, pairs: data.orders.map((o) => [o.id, o.strategyId] as const) },
    { entity: "order", field: "signalId", target: "signal", ids: signals, pairs: data.orders.map((o) => [o.id, o.signalId] as const) },
    { entity: "order", field: "agentRunId", target: "agentRun", ids: runs, pairs: data.orders.map((o) => [o.id, o.agentRunId] as const) },
    { entity: "order", field: "approvalId", target: "approval", ids: approvals, pairs: data.orders.map((o) => [o.id, o.approvalId] as const) },
    { entity: "fill", field: "orderId", target: "order", ids: orders, pairs: data.fills.map((f) => [f.id, f.orderId] as const) },
    { entity: "fill", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.fills.map((f) => [f.id, f.portfolioId] as const) },
    { entity: "fill", field: "instrumentId", target: "instrument", ids: instruments, pairs: data.fills.map((f) => [f.id, f.instrumentId] as const) },
    { entity: "riskLimit", field: "createdByUserId", target: "user", ids: users, pairs: data.riskLimits.map((l) => [l.id, l.createdByUserId] as const) },
    { entity: "riskBreach", field: "limitId", target: "riskLimit", ids: limits, pairs: data.riskBreaches.map((b) => [b.id, b.limitId] as const) },
    { entity: "riskBreach", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.riskBreaches.map((b) => [b.id, b.portfolioId] as const) },
    { entity: "riskBreach", field: "resolvedByUserId", target: "user", ids: users, pairs: data.riskBreaches.map((b) => [b.id, b.resolvedByUserId] as const) },
    { entity: "approval", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.approvals.map((a) => [a.id, a.portfolioId] as const) },
    { entity: "approval", field: "deskId", target: "desk", ids: desks, pairs: data.approvals.map((a) => [a.id, a.deskId] as const) },
    { entity: "approval", field: "decidedByUserId", target: "user", ids: users, pairs: data.approvals.map((a) => [a.id, a.decidedByUserId] as const) },
    { entity: "auditEvent", field: "portfolioId", target: "portfolio", ids: portfolios, pairs: data.auditEvents.map((e) => [e.id, e.portfolioId] as const) },
    { entity: "auditEvent", field: "deskId", target: "desk", ids: desks, pairs: data.auditEvents.map((e) => [e.id, e.deskId] as const) },
  ]);
}
