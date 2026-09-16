/**
 * Agent runs and their step-by-step reasoning traces over the last seven days.
 *
 * Every run carries a professional objective, structured input/output, token
 * and cost figures consistent with MODEL_PRICING, and an ordered trace of
 * thoughts, tool calls, tool results and final messages.
 */
import type { Agent, AgentKind, AgentRun, AgentRunStatus, AgentStep } from "@/lib/domain/agent";
import type { Actor } from "@/lib/domain/auth";
import { SYSTEM_ACTOR } from "@/lib/domain/auth";
import { estimateCostUsd } from "@/lib/llm/types";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, type SeedContext } from "../context";
import type { OrgBundle } from "./org";
import type { PortfolioBundle } from "./portfolios";
import type { AgentBundle } from "./agents";

interface RunScript {
  objective: string;
  summary: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  steps: ReadonlyArray<{ thought: string; tool: string; toolInput: Record<string, unknown>; toolOutput: Record<string, unknown>; observation: string }>;
  message: string;
}

/** Book label used in copy; global agents talk about the platform. */
function scopeLabel(agent: Agent, portfolios: PortfolioBundle): string {
  if (!agent.portfolioId) return "the platform";
  const p = portfolios.portfolios.find((x) => x.id === agent.portfolioId);
  return p ? p.name : "the portfolio";
}

const SCRIPTS: Record<AgentKind, (book: string, variant: number) => RunScript> = {
  market_intelligence: (book, v) => {
    const themes = ["front-end rates repricing", "dollar funding stress", "energy supply risk", "AI capex momentum"];
    const theme = themes[v % themes.length];
    return {
      objective: `Produce the ${v % 2 === 0 ? "European open" : "US pre-open"} cross-asset briefing for ${book}, with emphasis on ${theme}.`,
      summary: `Overnight session was orderly. Equity index futures held their range, ten-year yields drifted two basis points lower and the dollar was mixed. The one genuine signal was ${theme}: it now warrants a position-level response rather than monitoring only.`,
      input: { window: "overnight", focusThemes: [theme, "positioning", "liquidity"], universe: ["ESZ6", "ZNZ6", "EUR/USD", "GCZ6", "BTC-USD"] },
      output: {
        regime: v % 2 === 0 ? "risk_on_fragile" : "range_bound",
        convictionScore: round(0.52 + (v % 3) * 0.08, 2),
        headlines: [
          "Ten-year yield down two basis points on a soft services print out of the euro area.",
          "Index futures unchanged with realised volatility in the 30th percentile of the last year.",
          "Gold bid on central bank demand; copper lagging the industrial complex.",
        ],
        watchlist: ["ZNZ6", "GCZ6", "EUR/USD"],
      },
      steps: [
        {
          thought: "Start with the cross-asset overview so the briefing is anchored on measured moves rather than headlines.",
          tool: "get_market_overview",
          toolInput: { assetClasses: ["future", "forex", "crypto"], lookback: "1d" },
          toolOutput: { indices: { ESZ6: 0.0012, NQZ6: 0.0024, ZNZ6: -0.0008 }, fx: { "EUR/USD": 0.0011, "USD/JPY": -0.0006 }, crypto: { "BTC-USD": 0.019 } },
          observation: "All moves are inside one standard deviation of the trailing daily range except Bitcoin.",
        },
        {
          thought: "Confirm the rates move is a genuine repricing rather than a thin-liquidity artefact by checking the hourly bars.",
          tool: "get_bars",
          toolInput: { symbol: "ZNZ6", interval: "1h", limit: 24 },
          toolOutput: { bars: 24, rangeHigh: 111.72, rangeLow: 111.34, closeVsOpen: 0.0021, volumeVsAverage: 1.18 },
          observation: "Volume ran 18% above the 20-session average for the hour, so the move carries information.",
        },
        {
          thought: "Check whether the dollar leg corroborates the rates story or contradicts it.",
          tool: "get_quotes",
          toolInput: { symbols: ["EUR/USD", "USD/JPY", "GCZ6"] },
          toolOutput: { "EUR/USD": { mid: 1.0931, changePct: 0.0011 }, "USD/JPY": { mid: 150.11, changePct: -0.0006 }, GCZ6: { mid: 3452.4, changePct: 0.004 } },
          observation: "Euro firmer and gold bid: consistent with lower real yields, not with a growth scare.",
        },
        {
          thought: "Write the view up so downstream agents can size it, without expressing it as a trade instruction.",
          tool: "summarize_run",
          toolInput: { format: "briefing" },
          toolOutput: { published: true, wordCount: 218 },
          observation: "Briefing published to the house view store.",
        },
      ],
      message: `House view for ${book}: lower real yields with an orderly tape. Rates duration is the cleanest expression; equity beta adds little here.`,
    };
  },
  compliance: (book, v) => ({
    objective: `Sweep the last ${v % 2 === 0 ? "four" : "eight"} hours of orders, signals and agent actions across ${book} against the trading policy.`,
    summary: `Reviewed the period's order and signal flow. ${v % 3 === 0 ? "One issue raised: an agent-originated order exceeded the portfolio's agent approval threshold without an attached approval request." : "No policy breaches found; all agent-originated orders above threshold carried an approval and every restricted-name check passed."}`,
    input: { window: v % 2 === 0 ? "PT4H" : "PT8H", policies: ["mandate_conformance", "restricted_names", "agent_autonomy", "wash_trade_pattern"] },
    output: { ordersReviewed: 38 + v * 7, signalsReviewed: 12 + v * 3, issuesRaised: v % 3 === 0 ? 1 : 0, severity: v % 3 === 0 ? "warning" : "none" },
    steps: [
      {
        thought: "Pull every open and recently terminal order in the review window before looking at signals.",
        tool: "list_open_orders",
        toolInput: { window: "PT8H", includeTerminal: true },
        toolOutput: { count: 41, agentOriginated: 17, aboveThreshold: 3, withApproval: 3 },
        observation: "All three above-threshold agent orders carry an approval request; autonomy policy holds.",
      },
      {
        thought: "Cross-check the signals that produced those orders for mandate conformance.",
        tool: "list_recent_signals",
        toolInput: { window: "PT8H", statuses: ["new", "acted"] },
        toolOutput: { count: 14, outsideMandate: 0, missingThesis: 0 },
        observation: "Every signal names an instrument inside its portfolio's mandate and carries a thesis.",
      },
      {
        thought: "Record the outcome so the audit trail shows the sweep ran even when nothing was found.",
        tool: "summarize_run",
        toolInput: { format: "compliance_log" },
        toolOutput: { logged: true },
        observation: "Sweep recorded against the compliance log.",
      },
    ],
    message: `Compliance sweep complete for ${book}. ${v % 3 === 0 ? "One warning-level issue escalated to the head of compliance." : "No action required."}`,
  }),
  strategy_research: (book, v) => ({
    objective: `Evaluate whether the ${v % 2 === 0 ? "opening-range mean reversion" : "event probability mispricing"} research strategy survives realistic execution assumptions before proposing it to the research committee.`,
    summary: `Re-ran the candidate over a two-year out-of-sample window with realistic slippage. The edge survives but is materially smaller than the in-sample estimate: Sharpe falls from 1.5 to 1.1 once ${v % 2 === 0 ? "opening-auction slippage" : "the Kalshi bid/offer"} is charged. Recommending a paper deployment rather than live capital.`,
    input: { candidate: v % 2 === 0 ? "MRES" : "EVMIS", outOfSampleMonths: 24, slippageModel: "arrival_price_plus_half_spread", trials: 18 },
    output: { inSampleSharpe: 1.52, outOfSampleSharpe: 1.09, deflatedSharpe: 0.71, recommendation: "paper_deploy", capacityUsd: 40_000_000 },
    steps: [
      {
        thought: "Load the strategy definition so the parameter set under test is the committed one, not a local variant.",
        tool: "get_strategy",
        toolInput: { code: v % 2 === 0 ? "MRES" : "EVMIS" },
        toolOutput: { version: 3, status: "backtested", parameterCount: 6 },
        observation: "Testing version 3 as committed.",
      },
      {
        thought: "Pull the price history for the out-of-sample window and recompute the signal with execution costs charged.",
        tool: "get_bars",
        toolInput: { symbol: "ESZ6", interval: "1d", limit: 500 },
        toolOutput: { bars: 500, from: "2024-09-01", to: "2026-08-31" },
        observation: "Complete history with no gaps longer than a holiday.",
      },
      {
        thought: "Check capacity against the portfolio that would host it before recommending anything.",
        tool: "get_portfolio_snapshot",
        toolInput: { code: "SYS-TREND" },
        toolOutput: { nav: 720_000_000, grossLeverage: 3.4, freeMargin: 0.42 },
        observation: "Portfolio can host $40m without disturbing the trend allocation.",
      },
      {
        thought: "Write up the deflated Sharpe honestly: eighteen trials means the naive figure overstates the edge.",
        tool: "summarize_run",
        toolInput: { format: "research_note" },
        toolOutput: { published: true, sections: ["method", "results", "capacity", "risks"] },
        observation: "Research note filed for the committee.",
      },
    ],
    message: `Recommend paper deployment only. Deflated Sharpe of 0.71 does not clear the 1.0 bar for live capital on ${book}.`,
  }),
  portfolio_manager: (book, v) => ({
    objective: `Reconcile ${book} against the current house view and the desk risk budget, then size any adjustment required.`,
    summary: `Book is running slightly long risk versus the target expression. Trimmed the equity index leg and added to the rates leg, leaving gross exposure a touch lower and net duration inside budget. ${v % 3 === 0 ? "One order was routed for approval because it exceeded the agent notional threshold." : "All adjustments were inside the agent mandate."}`,
    input: { book, targetGrossLeverage: 2.5, riskBudgetPctNav: 0.01, houseView: "lower_real_yields" },
    output: { adjustments: 2, grossLeverageBefore: 2.71, grossLeverageAfter: 2.44, ordersSubmitted: 2, notionalUsd: 18_400_000 },
    steps: [
      {
        thought: "Establish where the book actually stands before deciding anything.",
        tool: "get_portfolio_snapshot",
        toolInput: { includeExposureByAssetClass: true },
        toolOutput: { nav: 820_000_000, grossLeverage: 2.71, netExposure: 0.84, dayPnl: -1_240_000 },
        observation: "Gross leverage is above the 2.5x working target; the day's loss is well inside tolerance.",
      },
      {
        thought: "Look at the positions themselves to see which leg is carrying the excess.",
        tool: "list_positions",
        toolInput: { open: true, sortBy: "grossNotional" },
        toolOutput: { count: 14, largest: { symbol: "ESZ6", pctNav: 0.33 }, secondLargest: { symbol: "ZNZ6", pctNav: 0.31 } },
        observation: "The equity index leg is the outsized one; the rates leg is under its target weight.",
      },
      {
        thought: "Confirm the risk report agrees before trading, so I am not acting on a stale snapshot.",
        tool: "get_risk_report",
        toolInput: {},
        toolOutput: { var95PctNav: 0.021, drawdownPct: -0.032, breachedLimits: 0, warningLimits: 1 },
        observation: "One limit in warning: single-instrument concentration on the index leg. Consistent with the trim.",
      },
      {
        thought: "Trim the index leg first so the concentration warning clears before adding elsewhere.",
        tool: "submit_order",
        toolInput: { symbol: "ESZ6", side: "SELL", quantity: 120, type: "LIMIT", rationale: "Reduce index concentration to clear the warning band." },
        toolOutput: { status: "ROUTED", estimatedNotionalUsd: 37_500_000 },
        observation: "Order accepted and routed to the execution agent.",
      },
      {
        thought: "Add the rates leg only after the trim is working, to avoid a transient gross spike.",
        tool: "submit_order",
        toolInput: { symbol: "ZNZ6", side: "BUY", quantity: 160, type: "LIMIT", rationale: "Express the lower-real-yield view in the most liquid part of the curve." },
        toolOutput: { status: "PENDING_APPROVAL", estimatedNotionalUsd: 17_840_000 },
        observation: "Routed for human approval: agent notional threshold applies.",
      },
    ],
    message: `${book} rebalanced. Gross leverage 2.71x to 2.44x, duration added in the ten-year, one order pending approval.`,
  }),
  signal_generation: (book, v) => {
    const symbols = ["SPY 261218P00600000", "AUD/USD", "GCZ6", "BTC-USD"];
    const symbol = symbols[v % symbols.length];
    return {
      objective: `Evaluate the strategy universe for ${book} and publish any proposal that clears the conviction and filter thresholds.`,
      summary: `Scanned the universe and published ${v % 3 === 0 ? "two proposals" : "one proposal"}. The strongest candidate is ${symbol}, where the model spread is at the widest decile of the last year and the confirmation filter agrees.`,
      input: { book, filters: ["momentum_confirmation", "volatility_band"], minConviction: 0.55 },
      output: { candidatesScanned: 13, proposalsPublished: v % 3 === 0 ? 2 : 1, topCandidate: symbol, topConviction: round(0.62 + (v % 4) * 0.05, 2) },
      steps: [
        {
          thought: "Read the strategy definition so the thresholds I apply are the deployed ones.",
          tool: "get_strategy",
          toolInput: { includeParameters: true },
          toolOutput: { version: 4, status: "live", entryBand: [14, 22] },
          observation: "Deployed parameters loaded; entry band confirmed.",
        },
        {
          thought: "Score the universe on the model spread before looking at any single name in detail.",
          tool: "get_bars",
          toolInput: { symbol, interval: "1d", limit: 120 },
          toolOutput: { bars: 120, realisedVol20d: 0.124, impliedVol: 0.171, spreadPercentile: 0.91 },
          observation: "Implied exceeds realised by 4.7 points, in the 91st percentile of the last year.",
        },
        {
          thought: "Check current quotes so the proposal's entry, stop and target are executable rather than theoretical.",
          tool: "get_quotes",
          toolInput: { symbols: [symbol] },
          toolOutput: { bid: 13.9, ask: 14.5, mid: 14.2, spreadBps: 42 },
          observation: "Spread is 42 basis points: acceptable for a 30-60 day tenor.",
        },
        {
          thought: "Publish the proposal with an explicit wing so no naked short leaves this agent.",
          tool: "propose_signal",
          toolInput: { symbol, direction: "SHORT", conviction: 0.68, horizonHours: 720 },
          toolOutput: { signalId: "pending", accepted: true },
          observation: "Proposal accepted into the signal queue for the portfolio manager.",
        },
      ],
      message: `Published ${v % 3 === 0 ? "two proposals" : "one proposal"} for ${book}; top candidate ${symbol}.`,
    };
  },
  execution: (book, v) => ({
    objective: `Work the approved parent order queue for ${book}, minimising slippage against arrival price.`,
    summary: `Worked ${v % 2 === 0 ? "two" : "three"} parent orders. Average slippage was 1.4 basis points against arrival, inside the 5 basis point tolerance. One child order was cancelled when the spread widened past the abort threshold and re-worked ten minutes later.`,
    input: { book, algo: "adaptive_limit", participationCap: 0.08, urgency: "normal" },
    output: { parentsWorked: v % 2 === 0 ? 2 : 3, childOrders: 11 + v, slippageBps: 1.4, cancelledChildren: 1, filledNotionalUsd: 24_600_000 },
    steps: [
      {
        thought: "Look at the resting queue first: anything already working constrains how much new size the book can absorb.",
        tool: "list_open_orders",
        toolInput: { statuses: ["ACKNOWLEDGED", "PARTIALLY_FILLED"] },
        toolOutput: { count: 4, workingNotionalUsd: 9_200_000 },
        observation: "Four orders working; enough headroom for the new parents.",
      },
      {
        thought: "Check the top of book before sizing the first child order.",
        tool: "get_quotes",
        toolInput: { symbols: ["ESZ6", "SPY"] },
        toolOutput: { ESZ6: { bid: 6249.75, ask: 6250.25, spreadTicks: 2 }, SPY: { bid: 619.98, ask: 620.02, spreadBps: 0.6 } },
        observation: "Both spreads are at their typical width; no need to slow the schedule.",
      },
      {
        thought: "Send the first child inside the spread rather than crossing it; the parent is not marked urgent.",
        tool: "submit_order",
        toolInput: { symbol: "SPY", side: "BUY", quantity: 8_000, type: "LIMIT", limitPrice: 620.0 },
        toolOutput: { status: "ACKNOWLEDGED", externalOrderId: "IB-8842193" },
        observation: "Resting at the mid; filled within ninety seconds.",
      },
      {
        thought: "The spread widened past the abort threshold on the second name; cancel rather than chase.",
        tool: "cancel_order",
        toolInput: { reason: "spread_widened_beyond_threshold" },
        toolOutput: { cancelled: true, filledBeforeCancel: 0.34 },
        observation: "Cancelled with 34% of the child filled; remainder re-queued.",
      },
    ],
    message: `${book} execution complete: 1.4 basis points of slippage, one child cancelled and re-worked.`,
  }),
  risk_sentinel: (book, v) => ({
    objective: `Evaluate ${book} against every applicable limit and propose remediation for anything in breach or warning.`,
    summary: `${v % 3 === 0 ? "One limit is in breach: single-instrument concentration on the largest position. Requested a hedge in the index future rather than an outright trim, which preserves the theme while cutting the concentration metric." : "All limits inside tolerance. Two metrics are in the warning band and are being tracked into the next session."}`,
    input: { book, metrics: ["gross_exposure_pct_nav", "single_instrument_pct_nav", "var_95_pct_nav", "daily_loss_pct_nav", "margin_utilization_pct"] },
    output: { limitsEvaluated: 9, breached: v % 3 === 0 ? 1 : 0, warning: 2, hedgeRequested: v % 3 === 0, actionNotionalUsd: v % 3 === 0 ? 14_200_000 : 0 },
    steps: [
      {
        thought: "Pull the risk report first; every decision below has to reference a measured metric.",
        tool: "get_risk_report",
        toolInput: {},
        toolOutput: { grossExposurePctNav: 2.44, var95PctNav: 0.023, dailyLossPctNav: -0.006, marginUtilizationPct: 0.41, breached: v % 3 === 0 ? 1 : 0 },
        observation: v % 3 === 0 ? "Concentration limit breached at 33% of NAV against a 15% threshold." : "Nothing breached; VaR and margin both comfortable.",
      },
      {
        thought: "Identify which position drives the metric before proposing anything.",
        tool: "list_positions",
        toolInput: { open: true, sortBy: "pctNav" },
        toolOutput: { largest: { symbol: "ESZ6", pctNav: 0.33 }, second: { symbol: "ZNZ6", pctNav: 0.31 } },
        observation: "The index future is the driver; the rates leg is close behind but inside its own limit.",
      },
      {
        thought: "A hedge reduces the metric without abandoning the book's macro expression, so prefer it to an outright trim.",
        tool: "request_hedge",
        toolInput: { instrument: "ESZ6", direction: "SHORT", notionalUsd: 14_200_000, reason: "single_instrument_pct_nav" },
        toolOutput: { accepted: true, approvalRequired: true },
        observation: "Hedge request accepted and routed for approval.",
      },
    ],
    message: `${book} risk review complete. ${v % 3 === 0 ? "Hedge requested against the index concentration breach." : "No action required this cycle."}`,
  }),
};

/** Runs per agent, in roster order; sums to forty. */
const RUNS_PER_AGENT: readonly number[] = [3, 3, 2, 3, 3, 2, 2, 3, 3, 2, 2, 2, 2, 3, 3, 2];

interface StatusOverride {
  agentKey: string;
  /** Index from the most recent run backwards (0 = latest). */
  fromLatest: number;
  status: AgentRunStatus;
  error: string | null;
}

const STATUS_OVERRIDES: readonly StatusOverride[] = [
  { agentKey: "vega-pm", fromLatest: 0, status: "running", error: null },
  { agentKey: "nexus-risk", fromLatest: 0, status: "failed", error: "Risk report unavailable: the Coinbase account heartbeat was stale for 214 seconds and the guardrail forbids acting on a stale report." },
  { agentKey: "vega-exec", fromLatest: 0, status: "killed", error: "Killed by Rachel Goldberg: the option structure was being worked while the underlying was halted for volatility." },
  { agentKey: "helix-research", fromLatest: 0, status: "budget_exhausted", error: "Step budget of 16 exhausted while re-running the out-of-sample sweep; partial results were retained." },
];

export interface AgentActivityBundle {
  runs: AgentRun[];
  steps: AgentStep[];
}

function triggerActor(agent: Agent, org: OrgBundle, useOwner: boolean): { trigger: AgentRun["trigger"]; actor: Actor } {
  if (!useOwner) return { trigger: "schedule", actor: SYSTEM_ACTOR };
  const owner = org.users.find((u) => u.id === agent.ownerUserId);
  if (!owner) throw new Error(`Seed generation error: agent ${agent.id} has no owner`);
  return { trigger: "manual", actor: { kind: "user", id: owner.id, name: owner.name } };
}

export function generateAgentActivity(
  ctx: SeedContext,
  org: OrgBundle,
  portfolios: PortfolioBundle,
  agentBundle: AgentBundle,
): AgentActivityBundle {
  const runs: AgentRun[] = [];
  const steps: AgentStep[] = [];
  let richTraceBudget = 10;

  agentBundle.agents.forEach((agent, agentIndex) => {
    const key = agentBundle.keyOf(agent.id);
    const book = scopeLabel(agent, portfolios);
    const count = RUNS_PER_AGENT[agentIndex % RUNS_PER_AGENT.length];
    for (let i = 0; i < count; i++) {
      const fromLatest = count - 1 - i;
      const script = SCRIPTS[agent.kind](book, i + agentIndex);
      const override = STATUS_OVERRIDES.find((o) => o.agentKey === key && o.fromLatest === fromLatest);
      const status: AgentRunStatus = override ? override.status : "succeeded";
      const startedAt = ctx.hoursAgo(6.5 + fromLatest * ctx.rng.range(28, 44));
      const { trigger, actor } = triggerActor(agent, org, i === 0 && agentIndex % 4 === 0);

      const rich = richTraceBudget > 0 && ctx.rng.chance(0.55);
      if (rich) richTraceBudget -= 1;
      const scripted = script.steps;
      const pairCount = rich ? scripted.length : Math.max(1, Math.min(scripted.length, ctx.rng.int(1, 2)));
      const runId = ctx.ids.next(ID_PREFIX.agentRun);

      let index = 0;
      let cursor = new Date(startedAt).getTime();
      let inputTokens = 0;
      let outputTokens = 0;
      const push = (kind: AgentStep["kind"], content: string, extra: Partial<AgentStep> = {}): void => {
        const stepIn = ctx.rng.int(2_400, 9_200);
        const stepOut = kind === "tool_result" ? 0 : ctx.rng.int(120, 900);
        const latencyMs = round(ctx.rng.range(220, 4_800), 0);
        cursor += latencyMs + ctx.rng.int(30, 900);
        inputTokens += stepIn;
        outputTokens += stepOut;
        steps.push({
          id: ctx.ids.next(ID_PREFIX.agentStep),
          runId,
          index,
          kind,
          content,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          inputTokens: stepIn,
          outputTokens: stepOut,
          latencyMs,
          at: new Date(cursor).toISOString(),
          ...extra,
        });
        index += 1;
      };

      for (let s = 0; s < pairCount; s++) {
        const step = scripted[s];
        push("thought", step.thought);
        push("tool_call", step.tool, { toolName: step.tool, toolInput: step.toolInput });
        push("tool_result", step.observation, { toolName: step.tool, toolOutput: step.toolOutput });
      }
      if (status === "failed" && override) {
        push("error", override.error ?? "Run failed.");
      } else if (status === "succeeded") {
        push("message", script.message);
      }

      const finishedAt = status === "running" ? null : new Date(cursor + ctx.rng.int(200, 2_000)).toISOString();
      runs.push({
        id: runId,
        agentId: agent.id,
        agentKind: agent.kind,
        agentName: agent.name,
        portfolioId: agent.portfolioId,
        status,
        trigger,
        triggeredBy: actor,
        objective: script.objective,
        input: script.input,
        output: status === "succeeded" ? script.output : null,
        summary: status === "succeeded" ? script.summary : status === "running" ? "Run in progress." : `${script.objective} Run ended early: ${override?.error ?? "no result produced"}`,
        stepCount: index,
        inputTokens,
        outputTokens,
        costUsd: round(estimateCostUsd(agent.model, inputTokens, outputTokens), 4),
        signalIds: [],
        orderIds: [],
        error: override?.error ?? null,
        startedAt,
        finishedAt,
      });
    }

    const latest = runs.filter((r) => r.agentId === agent.id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    if (latest) {
      agent.lastRunAt = latest.startedAt;
      agent.lastRunId = latest.id;
    }
  });

  runs.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  return { runs, steps };
}
