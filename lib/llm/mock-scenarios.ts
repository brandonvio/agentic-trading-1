/**
 * Scenario definitions for `MockLLMProvider`: for every agent kind, an ordered
 * tool plan (what a competent agent of that kind would call, in what order,
 * with inputs derived from the conversation so far) and a builder for the
 * final structured output. Everything is a pure function of the
 * conversation state, which keeps the mock deterministic.
 */
import type { AgentKind } from "@/lib/domain/agent";
import type { Prng } from "./prng";
import { isRecord } from "./json";

export interface RecordedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Parsed tool result (object when JSON, raw string otherwise); undefined until a result arrives. */
  result: unknown;
  isError: boolean;
}

export interface MockTurnContext {
  kind: AgentKind;
  /** Structured context parsed from the opening user message. */
  input: Record<string, unknown>;
  objective: string;
  calls: RecordedToolCall[];
  offered: ReadonlySet<string>;
  prng: Prng;
}

export interface PlannedCall {
  name: string;
  /** One entry per intended invocation; an empty array skips the tool this turn. */
  inputs(ctx: MockTurnContext): Array<Record<string, unknown>>;
}

export type OutputBuilder = (ctx: MockTurnContext) => Record<string, unknown>;

export interface MockScenario {
  plan: PlannedCall[];
  output: OutputBuilder;
}

// ---------------------------------------------------------------------------
// Conversation helpers
// ---------------------------------------------------------------------------
export function resultOf(ctx: MockTurnContext, name: string, nth = 0): Record<string, unknown> | null {
  const hits = ctx.calls.filter((c) => c.name === name && !c.isError && isRecord(c.result));
  const hit = hits[nth];
  return hit && isRecord(hit.result) ? hit.result : null;
}

export function allResults(ctx: MockTurnContext, name: string): Record<string, unknown>[] {
  return ctx.calls.filter((c) => c.name === name && !c.isError && isRecord(c.result)).map((c) => c.result as Record<string, unknown>);
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function records(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

export function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function portfolioId(ctx: MockTurnContext): string | null {
  return typeof ctx.input.portfolioId === "string" ? ctx.input.portfolioId : null;
}

function nav(ctx: MockTurnContext): number {
  return num(resultOf(ctx, "get_portfolio_snapshot")?.nav, 10_000_000);
}

/** Candidate instrument ids gathered from input context and prior tool results. */
export function candidateInstrumentIds(ctx: MockTurnContext): string[] {
  const ids: string[] = [];
  ids.push(...strings(ctx.input.instrumentIds));
  for (const s of records(ctx.input.signals)) ids.push(str(s.instrumentId));
  for (const d of records(ctx.input.decisions)) ids.push(str(d.instrumentId));
  ids.push(...strings(resultOf(ctx, "get_strategy")?.instrumentIds));
  for (const m of records(resultOf(ctx, "get_market_overview")?.movers)) ids.push(str(m.instrumentId));
  for (const p of records(resultOf(ctx, "list_positions")?.positions)) ids.push(str(p.instrumentId));
  for (const s of records(resultOf(ctx, "list_recent_signals")?.signals)) ids.push(str(s.instrumentId));
  return [...new Set(ids.filter(Boolean))];
}

export function quotes(ctx: MockTurnContext): Record<string, unknown>[] {
  return allResults(ctx, "get_quotes").flatMap((r) => records(r.quotes));
}

function quoteFor(ctx: MockTurnContext, instrumentId: string): Record<string, unknown> | null {
  return quotes(ctx).find((q) => q.instrumentId === instrumentId) ?? null;
}

// ---------------------------------------------------------------------------
// Shared planned calls
// ---------------------------------------------------------------------------
const snapshot: PlannedCall = {
  name: "get_portfolio_snapshot",
  inputs: (ctx) => (portfolioId(ctx) ? [{ portfolioId: portfolioId(ctx) }] : []),
};
const riskReport: PlannedCall = {
  name: "get_risk_report",
  inputs: (ctx) => (portfolioId(ctx) ? [{ portfolioId: portfolioId(ctx) }] : []),
};
const overview: PlannedCall = { name: "get_market_overview", inputs: () => [{}] };
const strategy: PlannedCall = {
  name: "get_strategy",
  inputs: (ctx) => (typeof ctx.input.strategyId === "string" ? [{ strategyId: ctx.input.strategyId }] : []),
};
const quotesCall: PlannedCall = {
  name: "get_quotes",
  inputs: (ctx) => {
    const ids = candidateInstrumentIds(ctx).slice(0, 4);
    return ids.length ? [{ instrumentIds: ids }] : [];
  },
};
const barsCall: PlannedCall = {
  name: "get_bars",
  inputs: (ctx) => {
    const id = candidateInstrumentIds(ctx)[0];
    return id ? [{ instrumentId: id, interval: "1d", count: 20 }] : [];
  },
};
const positions: PlannedCall = {
  name: "list_positions",
  inputs: (ctx) => (portfolioId(ctx) ? [{ portfolioId: portfolioId(ctx), open: true }] : []),
};
const openOrders: PlannedCall = {
  name: "list_open_orders",
  inputs: (ctx) => (portfolioId(ctx) ? [{ portfolioId: portfolioId(ctx) }] : []),
};
const recentSignals: PlannedCall = {
  name: "list_recent_signals",
  inputs: (ctx) => (portfolioId(ctx) ? [{ portfolioId: portfolioId(ctx), status: "new", limit: 20 }] : []),
};

function signalInput(ctx: MockTurnContext, instrumentId: string, index: number): Record<string, unknown> {
  const q = quoteFor(ctx, instrumentId);
  const last = num(q?.last, 100);
  const changePct = num(q?.changePct, 0.004);
  const direction = changePct >= 0 ? "LONG" : "SHORT";
  const long = direction === "LONG";
  const notional = Math.round(nav(ctx) * 0.01);
  const quantity = Math.max(1, Math.floor(notional / Math.max(last, 0.01)));
  const symbol = str(q?.symbol, instrumentId);
  return {
    instrumentId,
    direction,
    conviction: Math.round((0.55 + 0.1 * (2 - index)) * 100) / 100,
    expectedReturnPct: long ? 0.025 : -0.02,
    horizonHours: 48,
    suggestedNotional: notional,
    suggestedQuantity: quantity,
    entryPrice: last,
    stopPrice: round(long ? last * 0.98 : last * 1.02),
    targetPrice: round(long ? last * 1.04 : last * 0.96),
    thesis: `${symbol}: ${long ? "positive" : "negative"} momentum (${(changePct * 100).toFixed(2)}% on the session) aligned with the strategy view; risk defined at ${long ? "-2%" : "+2%"}.`,
    factors: [
      { factor: "momentum", weight: 0.5, evidence: `session change ${(changePct * 100).toFixed(2)}%` },
      { factor: "regime", weight: 0.3, evidence: `market regime ${str(resultOf(ctx, "get_market_overview")?.regime, "unknown")}` },
      { factor: "liquidity", weight: 0.2, evidence: `volume ${num(q?.volume)}` },
    ],
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Per-kind scenarios
// ---------------------------------------------------------------------------
export const DEFAULT_SCENARIOS: Record<AgentKind, MockScenario> = {
  market_intelligence: {
    plan: [overview, quotesCall, barsCall],
    output: (ctx) => {
      const ov = resultOf(ctx, "get_market_overview");
      const movers = records(ov?.movers);
      const regime = str(ov?.regime, "neutral");
      return {
        summary: `${str(ov?.headline, "Markets are mixed")}. Regime classified as ${regime}; ${movers.length} notable movers reviewed.`,
        regime,
        headline: str(ov?.headline, "Mixed cross-asset tape"),
        themes: [
          { theme: "Rates & the dollar", instruments: movers.slice(0, 2).map((m) => str(m.symbol)), direction: regime === "risk_off" ? "bearish" : "bullish", rationale: "Front-end pricing drives beta and carry simultaneously." },
          { theme: "Event-driven volatility", instruments: movers.slice(2, 4).map((m) => str(m.symbol)), direction: "mixed", rationale: "Scheduled catalysts concentrate gamma into the next session." },
        ],
        watchlist: movers.slice(0, 4).map((m) => ({
          instrumentId: str(m.instrumentId),
          symbol: str(m.symbol),
          lean: num(m.changePct) >= 0 ? "long" : "short",
          catalyst: `Session move ${(num(m.changePct) * 100).toFixed(2)}%`,
        })),
        riskFlags: records(ov?.eventCalendar).filter((e) => e.importance === "high").map((e) => `${str(e.time)}: ${str(e.event)}`),
        confidence: 0.68,
      };
    },
  },

  strategy_research: {
    plan: [strategy, overview, barsCall],
    output: (ctx) => {
      const s = resultOf(ctx, "get_strategy");
      const params = isRecord(s?.parameters) ? s.parameters : {};
      const [firstParam] = Object.entries(params);
      return {
        summary: `Thesis for ${str(s?.code, "strategy")} remains intact in the current regime; one parameter refinement proposed with a validating backtest.`,
        thesisStatus: "intact",
        hypotheses: firstParam
          ? [{ hypothesis: `A modest change to ${firstParam[0]} improves risk-adjusted return without raising drawdown.`, parameter: firstParam[0], currentValue: firstParam[1], proposedValue: typeof firstParam[1] === "number" ? firstParam[1] * 1.1 : firstParam[1], validationMetric: "sharpe" }]
          : [],
        backtestRequests: [{ from: "2025-01-01", to: "2026-08-31", parameters: params }],
        confidence: 0.6,
      };
    },
  },

  signal_generation: {
    plan: [
      strategy,
      overview,
      quotesCall,
      barsCall,
      snapshot,
      {
        name: "propose_signal",
        inputs: (ctx) => candidateInstrumentIds(ctx).slice(0, 2).map((id, i) => signalInput(ctx, id, i)),
      },
    ],
    output: (ctx) => {
      const proposed = allResults(ctx, "propose_signal");
      return {
        summary: proposed.length ? `Proposed ${proposed.length} signal(s) consistent with the strategy thesis and current regime.` : "No signals proposed: no candidate instruments met the entry criteria.",
        signals: proposed.map((p) => ({ signalId: str(p.signalId), symbol: str(p.symbol), direction: str(p.direction), conviction: num(p.conviction), suggestedNotional: num(p.suggestedNotional) })),
        noTrade: candidateInstrumentIds(ctx).slice(2, 4).map((id) => ({ symbol: str(quoteFor(ctx, id)?.symbol, id), reason: "Insufficient conviction versus existing exposure." })),
      };
    },
  },

  portfolio_manager: {
    plan: [snapshot, riskReport, recentSignals],
    output: (ctx) => {
      const candidates = [...records(ctx.input.signals), ...records(resultOf(ctx, "list_recent_signals")?.signals)];
      const seen = new Set<string>();
      const budget = nav(ctx) * 0.02;
      const decisions = candidates
        .filter((s) => (seen.has(str(s.id ?? s.signalId)) ? false : (seen.add(str(s.id ?? s.signalId)), true)))
        .map((s) => {
          const suggested = num(s.suggestedNotional);
          const approvedNotional = Math.min(suggested, budget);
          const price = num(s.entryPrice, 0);
          const side = s.side === "BUY" || s.side === "SELL" ? s.side : s.direction === "SHORT" ? "SELL" : "BUY";
          return {
            signalId: str(s.id ?? s.signalId),
            instrumentId: str(s.instrumentId),
            symbol: str(s.symbol),
            action: approvedNotional < suggested ? "reduce" : "approve",
            side,
            approvedQuantity: price > 0 ? Math.max(1, Math.floor(approvedNotional / price)) : num(s.suggestedQuantity),
            approvedNotional: Math.round(approvedNotional),
            rationale: approvedNotional < suggested ? "Trimmed to the 2% NAV per-idea budget." : "Fits concentration and leverage headroom.",
          };
        });
      return {
        summary: decisions.length ? `Sized ${decisions.length} candidate signal(s); each capped at 2% NAV.` : "No candidate signals to size this cycle.",
        decisions,
        riskBudgetUsedPct: Math.round((decisions.reduce((a, d) => a + d.approvedNotional, 0) / Math.max(nav(ctx), 1)) * 10_000) / 100,
      };
    },
  },

  execution: {
    plan: [
      snapshot,
      openOrders,
      quotesCall,
      {
        name: "submit_order",
        inputs: (ctx) =>
          records(ctx.input.decisions)
            .filter((d) => d.action === "approve" || d.action === "reduce")
            .map((d) => ({
              portfolioId: portfolioId(ctx),
              instrumentId: str(d.instrumentId),
              side: str(d.side, "BUY"),
              type: "MARKET",
              quantity: Math.max(1, num(d.approvedQuantity, 1)),
              signalId: str(d.signalId) || undefined,
              rationale: `Executing PM-approved signal ${str(d.signalId)} on ${str(d.symbol)}: ${str(d.rationale)}`,
            })),
      },
    ],
    output: (ctx) => {
      const submitted = allResults(ctx, "submit_order");
      const decisions = records(ctx.input.decisions);
      return {
        summary: submitted.length ? `Submitted ${submitted.length} order(s); statuses: ${submitted.map((o) => str(o.status)).join(", ")}.` : "No approved signals to execute.",
        executions: submitted.map((o) => ({ signalId: str(o.signalId) || null, orderId: str(o.orderId), symbol: str(o.symbol), side: str(o.side), quantity: num(o.quantity), status: str(o.status) })),
        skipped: decisions.filter((d) => d.action !== "approve" && d.action !== "reduce").map((d) => ({ signalId: str(d.signalId), reason: `PM action was ${str(d.action)}.` })),
      };
    },
  },

  risk_sentinel: {
    plan: [
      snapshot,
      riskReport,
      positions,
      openOrders,
      {
        name: "request_hedge",
        inputs: (ctx) => {
          const breached = records(resultOf(ctx, "get_risk_report")?.limits).some((l) => l.status === "breached");
          const inputBreaches = records(ctx.input.breaches).length > 0;
          const largest = records(resultOf(ctx, "list_positions")?.positions).sort((a, b) => Math.abs(num(b.marketValue)) - Math.abs(num(a.marketValue)))[0];
          if (!(breached || inputBreaches) || !largest || !portfolioId(ctx)) return [];
          const mv = num(largest.marketValue);
          return [{ portfolioId: portfolioId(ctx), instrumentId: str(largest.instrumentId), side: mv >= 0 ? "SELL" : "BUY", notional: Math.round(Math.abs(mv) * 0.5), rationale: `Reduce largest exposure ${str(largest.symbol)} by half while limits are breached.` }];
        },
      },
    ],
    output: (ctx) => {
      const limits = records(resultOf(ctx, "get_risk_report")?.limits);
      const issues = limits.filter((l) => l.status !== "ok").map((l) => ({ metric: str(isRecord(l.limit) ? l.limit.metric : ""), observed: num(l.observed), threshold: num(isRecord(l.limit) ? l.limit.threshold : 0), status: str(l.status), action: l.status === "breached" ? "hedge proposed" : "monitor" }));
      const hedges = allResults(ctx, "request_hedge");
      const severity = issues.some((i) => i.status === "breached") ? "critical" : issues.length ? "warning" : "none";
      return {
        summary: issues.length ? `${issues.length} limit(s) need attention; ${hedges.length} hedge(s) proposed.` : "Book is clean: all limits within thresholds.",
        severity,
        issues,
        hedgeProposals: hedges.map((h) => ({ signalId: str(h.signalId), symbol: str(h.symbol), rationale: str(h.thesis) })),
        escalate: severity === "critical" && hedges.length === 0,
      };
    },
  },

  compliance: {
    plan: [
      openOrders,
      recentSignals,
      riskReport,
      {
        name: "flag_compliance_issue",
        inputs: (ctx) => {
          const orders = records(resultOf(ctx, "list_open_orders")?.orders);
          const bad = orders.find((o) => o.origin === "agent" && !str(o.rationale).trim());
          if (!bad || !portfolioId(ctx)) return [];
          return [{ portfolioId: portfolioId(ctx), subjectType: "order", subjectId: str(bad.id), policy: "agent-orders-require-rationale", severity: "warning", description: `Agent order ${str(bad.id)} on ${str(bad.symbol)} carries no rationale.` }];
        },
      },
    ],
    output: (ctx) => {
      const flagged = allResults(ctx, "flag_compliance_issue");
      return {
        summary: flagged.length ? `${flagged.length} compliance finding(s) recorded for review.` : "Review period clear: agent activity within policy and fully audited.",
        verdict: flagged.length ? "review" : "clear",
        findings: flagged.map((f) => ({ severity: str(f.severity, "warning"), subjectType: str(f.subjectType, "order"), subjectId: str(f.subjectId), policy: str(f.policy), description: str(f.description) })),
      };
    },
  },
};
