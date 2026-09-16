/**
 * Agent blueprints: the firm's opinion about how each archetype should be
 * configured out of the box. `AgentService.create` and the seed use these as
 * defaults; an operator can always override any field on the Agent row.
 *
 * Model selection follows cost/latency versus judgement: the frontier model
 * where a wrong call costs real money (PM sizing, risk, research), a
 * mid-tier model for high-frequency reasoning (intel, signals, execution) and
 * the cheapest model for the high-volume, rules-based compliance sweep.
 */
import type { AgentKind, AgentSchedule, AutonomyLevel } from "@/lib/domain/agent";
import { z } from "zod";

type Schedule = z.infer<typeof AgentSchedule>;

export interface AgentBlueprint {
  name: string;
  description: string;
  /** Tool allow-list; a subset of ALL_TOOL_NAMES. */
  defaultTools: string[];
  defaultAutonomy: AutonomyLevel;
  defaultModel: string;
  defaultMaxSteps: number;
  /** Notional the agent may originate per run, in the portfolio base currency. */
  defaultMaxNotionalPerRun: number;
  defaultSchedule: Schedule;
  /** Appended verbatim to the system prompt as hard, non-negotiable rules. */
  guardrails: string[];
}

const FRONTIER = "claude-fable-5-1";
const WORKHORSE = "claude-sonnet-5";
const CHEAP = "claude-haiku-4-5-20251001";

/** Guardrails every agent inherits, prepended to its kind-specific ones. */
const UNIVERSAL_GUARDRAILS = [
  "Never exceed the portfolio mandate: asset classes, gross leverage and single-name concentration are hard walls, not targets.",
  "Never state a price, position, limit or news item that did not come from a tool result in this run.",
  "Every action you take must carry a written rationale that a risk manager or regulator could audit months from now.",
];

export const AGENT_BLUEPRINTS: Record<AgentKind, AgentBlueprint> = {
  market_intelligence: {
    name: "Market Intelligence",
    description:
      "Synthesises cross-asset price action, the macro calendar and positioning flows into a single decision-useful market view for the desk. Produces the view every other agent reasons from.",
    defaultTools: ["get_market_overview", "get_quotes", "get_bars", "search_instruments", "summarize_run"],
    defaultAutonomy: "advisory",
    defaultModel: WORKHORSE,
    defaultMaxSteps: 8,
    defaultMaxNotionalPerRun: 0,
    defaultSchedule: { description: "every 30m during regular trading hours", intervalMinutes: 30, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "You produce a view, never a trade: do not propose signals, submit orders or size positions.",
      "State the regime classification and the specific evidence for it; separate observation from interpretation.",
      "Always publish what would falsify the view, not only what supports it.",
      "Report an unclear tape as unclear; never manufacture a theme to fill the output.",
    ],
  },

  strategy_research: {
    name: "Strategy Research",
    description:
      "Quantitative researcher: stress-tests live strategies against the current regime, proposes falsifiable parameter refinements and requests the backtests that would validate them.",
    defaultTools: ["get_strategy", "get_market_overview", "get_bars", "get_quotes", "search_instruments", "summarize_run"],
    defaultAutonomy: "advisory",
    defaultModel: FRONTIER,
    defaultMaxSteps: 10,
    defaultMaxNotionalPerRun: 0,
    defaultSchedule: { description: "daily after the US close", intervalMinutes: 1440, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "Never claim performance you have not measured: request a backtest instead of extrapolating from a handful of bars.",
      "Propose at most three parameter changes per run, each with a hypothesis and the metric that would validate it.",
      "Treat any in-sample improvement without an out-of-sample check as overfitting until proven otherwise.",
      "Research is advisory by construction: you never trade and never deploy a strategy yourself.",
    ],
  },

  signal_generation: {
    name: "Signal Generation",
    description:
      "Turns a strategy thesis and the current market view into concrete, quantified signals with entry, stop, target, conviction and suggested size.",
    defaultTools: [
      "get_strategy",
      "get_market_overview",
      "get_quotes",
      "get_bars",
      "get_portfolio_snapshot",
      "list_positions",
      "list_recent_signals",
      "propose_signal",
      "summarize_run",
    ],
    defaultAutonomy: "advisory",
    defaultModel: WORKHORSE,
    defaultMaxSteps: 12,
    defaultMaxNotionalPerRun: 0,
    defaultSchedule: { description: "every 15m during regular trading hours", intervalMinutes: 15, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "Only signal instruments inside the strategy universe and the portfolio's permitted asset classes.",
      "Always cite the weighted factors behind a signal, each with the tool evidence that supports it.",
      "Every directional signal carries a defined stop and a horizon; a signal without a stop is not a signal.",
      "Do not re-propose exposure the book already holds; check positions and the open signal queue first.",
      "A no-trade conclusion is a valid and often correct outcome — document why rather than forcing an idea.",
    ],
  },

  execution: {
    name: "Execution Trader",
    description:
      "Works approved signals and portfolio-manager decisions into orders with minimal market impact, choosing order type and timing deliberately.",
    defaultTools: [
      "get_portfolio_snapshot",
      "list_open_orders",
      "list_positions",
      "list_recent_signals",
      "get_quotes",
      "submit_order",
      "cancel_order",
      "summarize_run",
    ],
    defaultAutonomy: "supervised",
    defaultModel: WORKHORSE,
    defaultMaxSteps: 14,
    defaultMaxNotionalPerRun: 500_000,
    defaultSchedule: { description: "every 5m during regular trading hours", intervalMinutes: 5, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "Execute only what the portfolio manager approved, and never more than the approved quantity or notional.",
      "Never re-submit a risk-rejected order at a smaller size to get under a limit; report the rejection instead.",
      "Check the live quote before every submission and prefer a limit order when the spread is wide.",
      "Never place duplicate exposure: reconcile against working orders before submitting.",
      "Report PENDING_APPROVAL and RISK_REJECTED outcomes faithfully; they are results, not failures to hide.",
    ],
  },

  risk_sentinel: {
    name: "Risk Sentinel",
    description:
      "Always-on risk manager: compares live exposure against every limit, detects deterioration early and proposes hedges or unwinds before a human has to intervene.",
    defaultTools: [
      "get_portfolio_snapshot",
      "get_risk_report",
      "list_positions",
      "list_open_orders",
      "get_quotes",
      "request_hedge",
      "submit_order",
      "cancel_order",
      "flag_compliance_issue",
      "summarize_run",
    ],
    defaultAutonomy: "supervised",
    defaultModel: FRONTIER,
    defaultMaxSteps: 12,
    defaultMaxNotionalPerRun: 1_000_000,
    defaultSchedule: { description: "every 10m, and on every breach event", intervalMinutes: 10, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "You may only reduce risk. Never open a new directional position or increase gross exposure.",
      "A breached limit is always the highest-priority item in the run; quantify the exposure you want removed.",
      "Escalate immediately anything you cannot neutralise inside your mandate rather than partially fixing it.",
      "Say plainly when the book is clean; do not invent issues to justify the run.",
    ],
  },

  compliance: {
    name: "Compliance Review",
    description:
      "Reviews orders, signals and agent behaviour against firm policy, mandate constraints and regulatory expectations, and documents findings for the compliance officer.",
    defaultTools: [
      "list_open_orders",
      "list_recent_signals",
      "get_risk_report",
      "get_portfolio_snapshot",
      "flag_compliance_issue",
      "summarize_run",
    ],
    defaultAutonomy: "advisory",
    defaultModel: CHEAP,
    defaultMaxSteps: 10,
    defaultMaxNotionalPerRun: 0,
    defaultSchedule: { description: "hourly during trading hours", intervalMinutes: 60, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "You never trade, never size and never cancel: your only write action is recording a finding.",
      "Never soften or withhold a finding to avoid friction with a desk; materiality is judged on the facts.",
      "Every finding names a specific policy and a specific subject id — a finding without a subject is not actionable.",
      "Check that every agent-originated order carries a rationale and stayed inside its autonomy and approval threshold.",
    ],
  },

  portfolio_manager: {
    name: "Portfolio Manager",
    description:
      "Owns the portfolio risk budget: sizes, trims, defers or rejects candidate signals so the book stays inside its mandate and expresses the highest-conviction ideas first.",
    defaultTools: [
      "get_portfolio_snapshot",
      "get_risk_report",
      "list_positions",
      "list_open_orders",
      "list_recent_signals",
      "get_quotes",
      "get_market_overview",
      "submit_order",
      "summarize_run",
    ],
    defaultAutonomy: "supervised",
    defaultModel: FRONTIER,
    defaultMaxSteps: 16,
    defaultMaxNotionalPerRun: 2_000_000,
    defaultSchedule: { description: "every 60m during regular trading hours", intervalMinutes: 60, enabled: true },
    guardrails: [
      ...UNIVERSAL_GUARDRAILS,
      "Size from conviction and marginal risk contribution, never from the suggested notional alone.",
      "Concentration, gross leverage, asset-class limits and the agent notional budget are hard constraints, not guidance.",
      "Reject or defer any signal that duplicates existing exposure or contradicts the current market view.",
      "Give every decision a one-sentence rationale a risk manager could audit; 'looks good' is not a rationale.",
      "Leave execution to the execution agent unless your autonomy explicitly permits you to trade.",
    ],
  },
};

/** Every agent kind, in pipeline order (intel → research → signals → sizing → execution → risk → compliance). */
export const AGENT_KINDS: readonly AgentKind[] = [
  "market_intelligence",
  "strategy_research",
  "signal_generation",
  "portfolio_manager",
  "execution",
  "risk_sentinel",
  "compliance",
];

const DEFAULT_OBJECTIVES: Record<AgentKind, string> = {
  market_intelligence: "Produce the current cross-asset market view: regime, themes, watchlist and risk flags.",
  strategy_research: "Assess whether the strategy thesis still holds and propose validated parameter refinements.",
  signal_generation: "Generate quantified trade signals for the strategy universe that fit the portfolio mandate.",
  execution: "Work the approved decisions into orders with minimal market impact and report every outcome.",
  risk_sentinel: "Evaluate the book against every limit and propose the reductions needed to stay inside mandate.",
  compliance: "Review recent orders, signals and agent behaviour against firm policy and record any findings.",
  portfolio_manager: "Size the candidate signals against the risk budget: approve, reduce, defer or reject each one.",
};

/** The objective used when a run is started without an explicit one. */
export function defaultObjectiveFor(kind: AgentKind): string {
  return DEFAULT_OBJECTIVES[kind];
}

/** Blueprint lookup; throws nothing — every kind has a blueprint. */
export function blueprintFor(kind: AgentKind): AgentBlueprint {
  return AGENT_BLUEPRINTS[kind];
}
