/**
 * Signal and strategy tools: reading the strategy definition, reading the
 * signal queue, and persisting new trade ideas (`propose_signal`) or defensive
 * ones (`request_hedge`). Proposing a signal is a proposal, never an
 * execution, so advisory agents may do it; only order tools are gated on
 * autonomy.
 */
import { z } from "zod";
import { Side } from "@/lib/domain/common";
import { SignalDirection, SignalStatus, type Signal } from "@/lib/domain/agent";
import { ID_PREFIX } from "@/lib/core/ids";
import { NotFoundError, ValidationError } from "@/lib/core/errors";
import { defineTool, type ToolDefinition, type ToolContext } from "./registry";
import { PortfolioIdInput, addHours, agentActor, resolvePortfolioId } from "./shared";

const FactorInput = z.object({
  factor: z.string().min(1).describe("Short factor name, e.g. momentum, carry, positioning."),
  weight: z.number().describe("Relative contribution of the factor, roughly 0..1."),
  evidence: z.string().min(1).describe("The observation from a tool result that supports this factor."),
});

/** `{ signals, total }` — the recent signal queue for the portfolio. */
export const listRecentSignals = defineTool({
  name: "list_recent_signals",
  description:
    "List recent signals for the portfolio, newest first, with direction, conviction, suggested notional and quantity, entry/stop/target, thesis, factors and status. Use it to see what the desk has already proposed before adding to the queue, or (as a portfolio manager or execution agent) to pick up the candidates awaiting a decision.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    status: SignalStatus.optional().describe("Filter by status: new, acted, expired or dismissed."),
    instrumentId: z.string().min(1).optional().describe("Restrict to one instrument."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum signals to return."),
  }),
  permission: "agents:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const page = await ctx.repos.signals.list(
      { portfolioId, status: input.status, instrumentId: input.instrumentId },
      { limit: input.limit, offset: 0 },
    );
    return { portfolioId, total: page.total, signals: page.items };
  },
});

/** The strategy definition: thesis, style, parameters, universe and performance. */
export const getStrategy = defineTool({
  name: "get_strategy",
  description:
    "Return a strategy definition: code, name, thesis, style, status, asset classes, the instrument universe (`instrumentIds`), tunable parameters, portfolio deployments with allocated capital, and backtest/live performance statistics. Read the thesis before generating signals so every idea you propose is one the strategy is actually supposed to express.",
  schema: z.object({ strategyId: z.string().min(1).describe("Strategy id, e.g. strat_00042.") }),
  permission: "strategies:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const s = await ctx.services.strategies.get(ctx.principal, input.strategyId);
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      thesis: s.thesis,
      description: s.description,
      style: s.style,
      status: s.status,
      assetClasses: s.assetClasses,
      instrumentIds: s.instrumentIds,
      parameters: s.parameters,
      deployments: s.deployments,
      backtest: s.backtest,
      live: s.live,
      version: s.version,
    };
  },
});

/** `{ signalId, symbol, direction, … }` — persists a trade idea for the desk. */
export const proposeSignal = defineTool({
  name: "propose_signal",
  description:
    "Persist a trade idea as a Signal so the portfolio manager and execution agents can act on it. A signal is a proposal, not an order: nothing reaches a venue from this tool. Every signal must carry a defined stop, a horizon, a written thesis and the weighted factors with the evidence behind them. Returns the new signal id — reference it in your final JSON output.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    instrumentId: z.string().min(1).describe("Instrument the signal is on."),
    strategyId: z.string().min(1).optional().describe("Strategy this idea belongs to, when there is one."),
    direction: SignalDirection.describe("LONG, SHORT, FLAT (close out) or HEDGE."),
    side: Side.optional().describe("BUY or SELL; inferred from direction when omitted."),
    conviction: z.number().min(0).max(1).describe("Conviction from 0 to 1. Be honest: 0.5 means a coin flip."),
    expectedReturnPct: z.number().describe("Expected return over the horizon as a fraction, e.g. 0.025 for +2.5%."),
    horizonHours: z.number().positive().max(8760).describe("Holding horizon in hours; the signal expires after it."),
    suggestedNotional: z.number().nonnegative().describe("Suggested notional in the portfolio base currency."),
    suggestedQuantity: z.number().nonnegative().describe("Suggested quantity in instrument units."),
    entryPrice: z.number().positive().nullable().default(null).describe("Reference entry price from a quote."),
    stopPrice: z.number().positive().nullable().default(null).describe("Stop level. Required discipline for LONG and SHORT."),
    targetPrice: z.number().positive().nullable().default(null).describe("Target level."),
    thesis: z.string().min(1).max(2000).describe("One or two sentences a risk manager could audit."),
    factors: z.array(FactorInput).default([]).describe("Weighted factors with the tool evidence behind each."),
  }),
  permission: "agents:run",
  allowAdvisory: true,
  async execute(input, ctx) {
    const signal = await persistSignal(ctx, {
      portfolioId: resolvePortfolioId(ctx, input.portfolioId),
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      direction: input.direction,
      side: input.side ?? sideFor(input.direction),
      conviction: input.conviction,
      expectedReturnPct: input.expectedReturnPct,
      horizonHours: input.horizonHours,
      suggestedNotional: input.suggestedNotional,
      suggestedQuantity: input.suggestedQuantity,
      entryPrice: input.entryPrice,
      stopPrice: input.stopPrice,
      targetPrice: input.targetPrice,
      thesis: input.thesis,
      factors: input.factors,
    });
    return echo(signal);
  },
});

/** `{ signalId, symbol, direction: "HEDGE", … }` — persists a risk-reducing proposal. */
export const requestHedge = defineTool({
  name: "request_hedge",
  description:
    "Propose a hedge or a partial unwind as a HEDGE signal, sized by notional, when exposure needs to come down. Use it when a limit is breached or close to breaching and you want the reduction on the record for the portfolio manager and execution agent. This never sends an order.",
  schema: z.object({
    portfolioId: PortfolioIdInput,
    instrumentId: z.string().min(1).describe("Instrument to hedge or reduce."),
    side: Side.describe("BUY to cover a short, SELL to reduce a long."),
    notional: z.number().positive().describe("Notional to neutralise, in the portfolio base currency."),
    rationale: z.string().min(1).max(2000).describe("Which limit or exposure this addresses, and by how much."),
    horizonHours: z.number().positive().max(720).default(24).describe("How long the hedge proposal stays valid."),
    conviction: z.number().min(0).max(1).default(0.8).describe("Conviction from 0 to 1; defensive trades are usually high."),
  }),
  permission: "agents:run",
  allowAdvisory: true,
  async execute(input, ctx) {
    const portfolioId = resolvePortfolioId(ctx, input.portfolioId);
    const quote = await ctx.services.market.getQuote(ctx.principal, input.instrumentId);
    const price = quote.mid > 0 ? quote.mid : quote.last;
    const quantity = price > 0 ? Math.max(1, Math.floor(input.notional / price)) : 0;
    const signal = await persistSignal(ctx, {
      portfolioId,
      instrumentId: input.instrumentId,
      strategyId: null,
      direction: "HEDGE",
      side: input.side,
      conviction: input.conviction,
      expectedReturnPct: 0,
      horizonHours: input.horizonHours,
      suggestedNotional: input.notional,
      suggestedQuantity: quantity,
      entryPrice: price > 0 ? price : null,
      stopPrice: null,
      targetPrice: null,
      thesis: input.rationale,
      factors: [{ factor: "risk_reduction", weight: 1, evidence: input.rationale }],
    });
    return echo(signal);
  },
});

interface SignalDraft {
  portfolioId: string;
  instrumentId: string;
  strategyId: string | null;
  direction: Signal["direction"];
  side: Signal["side"];
  conviction: number;
  expectedReturnPct: number;
  horizonHours: number;
  suggestedNotional: number;
  suggestedQuantity: number;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  thesis: string;
  factors: Signal["factors"];
}

/** Resolve the instrument, build the Signal row, persist it and audit it. */
async function persistSignal(ctx: ToolContext, draft: SignalDraft): Promise<Signal> {
  const instrument = await ctx.repos.instruments.findById(draft.instrumentId);
  if (!instrument) throw new NotFoundError("Instrument", draft.instrumentId);
  if (!instrument.tradable) throw new ValidationError(`Instrument '${instrument.symbol}' is not tradable`);
  const now = ctx.clock.nowIso();
  const signal: Signal = {
    id: ctx.ids.next(ID_PREFIX.signal),
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
    portfolioId: draft.portfolioId,
    strategyId: draft.strategyId,
    agentId: ctx.agent.id,
    runId: ctx.run.id,
    direction: draft.direction,
    side: draft.side,
    conviction: draft.conviction,
    expectedReturnPct: draft.expectedReturnPct,
    horizonHours: draft.horizonHours,
    suggestedNotional: draft.suggestedNotional,
    suggestedQuantity: draft.suggestedQuantity,
    entryPrice: draft.entryPrice,
    stopPrice: draft.stopPrice,
    targetPrice: draft.targetPrice,
    thesis: draft.thesis,
    factors: draft.factors,
    status: "new",
    createdAt: now,
    expiresAt: addHours(now, draft.horizonHours),
  };
  const created = await ctx.repos.signals.create(signal);
  ctx.created.signalIds.push(created.id);
  await ctx.services.audit.record({
    action: "signal.created",
    actor: agentActor(ctx),
    targetType: "signal",
    targetId: created.id,
    portfolioId: created.portfolioId,
    deskId: ctx.agent.deskId,
    summary: `${ctx.agent.name} proposed ${created.direction} ${created.symbol} (conviction ${created.conviction})`,
    data: { runId: ctx.run.id, instrumentId: created.instrumentId, suggestedNotional: created.suggestedNotional },
    ip: null,
  });
  return created;
}

function sideFor(direction: Signal["direction"]): Signal["side"] {
  if (direction === "LONG") return "BUY";
  if (direction === "SHORT") return "SELL";
  return null;
}

/** The JSON-serialisable acknowledgement returned to the model. */
function echo(s: Signal): Record<string, unknown> {
  return {
    signalId: s.id,
    instrumentId: s.instrumentId,
    symbol: s.symbol,
    assetClass: s.assetClass,
    portfolioId: s.portfolioId,
    direction: s.direction,
    side: s.side,
    conviction: s.conviction,
    expectedReturnPct: s.expectedReturnPct,
    horizonHours: s.horizonHours,
    suggestedNotional: s.suggestedNotional,
    suggestedQuantity: s.suggestedQuantity,
    entryPrice: s.entryPrice,
    stopPrice: s.stopPrice,
    targetPrice: s.targetPrice,
    thesis: s.thesis,
    status: s.status,
    expiresAt: s.expiresAt,
  };
}

export const SIGNAL_TOOLS: readonly ToolDefinition[] = [listRecentSignals, getStrategy, proposeSignal, requestHedge];
