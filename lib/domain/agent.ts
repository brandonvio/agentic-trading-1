import { z } from "zod";
import { Side, Timestamped } from "./common";
import { AssetClass } from "./instrument";
import { Actor } from "./auth";

/**
 * Agent archetypes. Each maps to a definition in lib/agents/definitions with a
 * system prompt, a tool allow-list and an autonomy level.
 */
export const AgentKind = z.enum([
  "market_intelligence", // digests news / macro / flows into a structured market view
  "strategy_research", // proposes & tunes strategies, requests backtests
  "signal_generation", // turns strategy + market view into concrete signals
  "execution", // works signals into orders, chooses routing/algos
  "risk_sentinel", // continuously evaluates limits, proposes hedges/unwinds
  "compliance", // reviews orders/agent behaviour against policy
  "portfolio_manager", // orchestrates the others for a portfolio; final say on sizing
]);
export type AgentKind = z.infer<typeof AgentKind>;

/**
 * How much rope an agent has.
 *  - advisory: produces analysis/signals only; never submits orders
 *  - supervised: may submit orders, always routed through human approval
 *  - autonomous: may submit orders within mandate/thresholds without approval
 */
export const AutonomyLevel = z.enum(["advisory", "supervised", "autonomous"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const AgentStatus = z.enum(["idle", "running", "paused", "disabled", "error"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentSchedule = z.object({
  /** Cron-like human string, e.g. "every 15m during RTH"; mocked for now. */
  description: z.string(),
  intervalMinutes: z.number().int().positive().nullable(),
  enabled: z.boolean(),
});

export const Agent = Timestamped.extend({
  id: z.string(),
  kind: AgentKind,
  name: z.string(),
  description: z.string(),
  status: AgentStatus,
  autonomy: AutonomyLevel,
  /** Model the agent uses through the LLM gateway (e.g. "claude-fable-5-1"). */
  model: z.string(),
  /** Portfolio scope, or null for platform-wide agents (e.g. market intel). */
  portfolioId: z.string().nullable(),
  deskId: z.string().nullable(),
  strategyIds: z.array(z.string()).default([]),
  /** Names of tools the agent is permitted to call. */
  tools: z.array(z.string()),
  schedule: AgentSchedule,
  /** Free-form guardrails appended to the system prompt. */
  guardrails: z.array(z.string()).default([]),
  /** Per-run budget: max LLM steps and max notional the agent may originate. */
  maxStepsPerRun: z.number().int().positive().default(12),
  maxNotionalPerRun: z.number().nonnegative().default(0),
  ownerUserId: z.string(),
  lastRunAt: z.string().nullable().default(null),
  lastRunId: z.string().nullable().default(null),
});
export type Agent = z.infer<typeof Agent>;

export const CreateAgentInput = Agent.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
  lastRunId: true,
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;
export const UpdateAgentInput = CreateAgentInput.partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

export const AgentRunStatus = z.enum(["queued", "running", "succeeded", "failed", "killed", "budget_exhausted"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const AgentRunTrigger = z.enum(["manual", "schedule", "event", "orchestrator"]);
export type AgentRunTrigger = z.infer<typeof AgentRunTrigger>;

export const AgentStepKind = z.enum(["thought", "tool_call", "tool_result", "message", "error"]);
export type AgentStepKind = z.infer<typeof AgentStepKind>;

/** A single step in an agent's reasoning/acting trace. Fully persisted for auditability. */
export const AgentStep = z.object({
  id: z.string(),
  runId: z.string(),
  index: z.number().int().nonnegative(),
  kind: AgentStepKind,
  /** For thoughts/messages: the text. For tool calls: the tool name. */
  content: z.string(),
  toolName: z.string().nullable().default(null),
  toolInput: z.unknown().nullable().default(null),
  toolOutput: z.unknown().nullable().default(null),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().nonnegative().default(0),
  at: z.string(),
});
export type AgentStep = z.infer<typeof AgentStep>;

export const AgentRun = z.object({
  id: z.string(),
  agentId: z.string(),
  agentKind: AgentKind,
  agentName: z.string(),
  portfolioId: z.string().nullable(),
  status: AgentRunStatus,
  trigger: AgentRunTrigger,
  triggeredBy: Actor,
  /** Natural-language objective for this run. */
  objective: z.string(),
  /** Structured context passed in (e.g. { instrumentIds, riskBudget }). */
  input: z.record(z.string(), z.unknown()).default({}),
  /** Final structured output produced by the agent, if any. */
  output: z.record(z.string(), z.unknown()).nullable().default(null),
  summary: z.string().default(""),
  stepCount: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  /** Estimated LLM cost in USD. */
  costUsd: z.number().nonnegative().default(0),
  signalIds: z.array(z.string()).default([]),
  orderIds: z.array(z.string()).default([]),
  error: z.string().nullable().default(null),
  startedAt: z.string(),
  finishedAt: z.string().nullable().default(null),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const SignalDirection = z.enum(["LONG", "SHORT", "FLAT", "HEDGE"]);
export type SignalDirection = z.infer<typeof SignalDirection>;

export const SignalStatus = z.enum(["new", "acted", "expired", "dismissed"]);
export type SignalStatus = z.infer<typeof SignalStatus>;

/** A trade idea produced by an agent or strategy, with quantified conviction. */
export const Signal = z.object({
  id: z.string(),
  instrumentId: z.string(),
  symbol: z.string(),
  assetClass: AssetClass,
  portfolioId: z.string().nullable(),
  strategyId: z.string().nullable(),
  agentId: z.string().nullable(),
  runId: z.string().nullable(),
  direction: SignalDirection,
  side: Side.nullable(),
  /** 0..1 */
  conviction: z.number().min(0).max(1),
  /** Expected return over horizon, fraction. */
  expectedReturnPct: z.number(),
  horizonHours: z.number().positive(),
  /** Suggested notional in portfolio base currency. */
  suggestedNotional: z.number().nonnegative(),
  suggestedQuantity: z.number().nonnegative(),
  entryPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  thesis: z.string(),
  /** Key factors with weights: [{ factor, weight, evidence }]. */
  factors: z.array(z.object({ factor: z.string(), weight: z.number(), evidence: z.string() })).default([]),
  status: SignalStatus,
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Signal = z.infer<typeof Signal>;

export const CreateSignalInput = Signal.omit({ id: true, createdAt: true, status: true });
export type CreateSignalInput = z.infer<typeof CreateSignalInput>;
