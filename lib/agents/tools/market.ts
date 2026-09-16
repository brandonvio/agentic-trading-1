/**
 * Read-only market data tools: the market backdrop, quotes, price history and
 * instrument lookup. Every one of these is safe for an advisory agent.
 */
import { z } from "zod";
import { BarInterval, type Instrument } from "@/lib/domain/instrument";
import { AssetClass } from "@/lib/domain/instrument";
import { ValidationError } from "@/lib/core/errors";
import { defineTool, type ToolDefinition } from "./registry";

/** `{ regime, headline, indicators, movers, eventCalendar }` — the desk-wide backdrop. */
export const getMarketOverview = defineTool({
  name: "get_market_overview",
  description:
    "Return the current cross-asset market backdrop: regime classification (risk_on | risk_off | neutral | volatile), a headline, macro indicators, the biggest movers and the scheduled event calendar. Call this first when you need context before looking at individual instruments. Takes no arguments.",
  schema: z.object({}),
  permission: "market:read",
  allowAdvisory: true,
  async execute(_input, ctx) {
    return ctx.services.market.getMarketOverview(ctx.principal);
  },
});

/** `{ quotes, unresolved }` — live quotes for instruments named by id or symbol. */
export const getQuotes = defineTool({
  name: "get_quotes",
  description:
    "Return live quotes (bid, ask, last, mid, sizes, session volume, change since previous close, implied vol) for up to 25 instruments. Identify them by `instrumentIds`, by `symbols`, or both; symbols are resolved to instruments and anything unknown is reported back in `unresolved`. Never invent a price: if an instrument is missing from the result, you do not have a quote for it.",
  schema: z.object({
    instrumentIds: z.array(z.string().min(1)).max(25).optional().describe("Platform instrument ids, e.g. ins_00123."),
    symbols: z.array(z.string().min(1)).max(25).optional().describe("Canonical symbols, e.g. AAPL, EUR/USD, BTC-USD, ESZ6."),
  }),
  permission: "market:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const ids = [...(input.instrumentIds ?? [])];
    const unresolved: string[] = [];
    for (const symbol of input.symbols ?? []) {
      const found = await ctx.repos.instruments.findBySymbol(symbol);
      if (found) ids.push(found.id);
      else unresolved.push(symbol);
    }
    const unique = [...new Set(ids)];
    if (unique.length === 0 && unresolved.length === 0) {
      throw new ValidationError("Provide at least one of instrumentIds or symbols");
    }
    const quotes = unique.length ? await ctx.services.market.getQuotes(ctx.principal, unique) : [];
    const returned = new Set(quotes.map((q) => q.instrumentId));
    for (const id of unique) if (!returned.has(id)) unresolved.push(id);
    return { asOf: ctx.clock.nowIso(), quotes, unresolved };
  },
});

/** `{ instrumentId, interval, bars, stats }` — recent OHLCV history plus summary statistics. */
export const getBars = defineTool({
  name: "get_bars",
  description:
    "Return the most recent OHLCV bars for one instrument at a given interval, oldest first, plus summary statistics (first/last close, percentage change over the window, high, low, average volume). Use it to confirm a setup or measure a move; do not ask for more than you will actually read.",
  schema: z.object({
    instrumentId: z.string().min(1).describe("Instrument id to load history for."),
    interval: BarInterval.default("1d").describe("Bar interval: 1m, 5m, 15m, 1h or 1d."),
    count: z.number().int().min(1).max(500).default(30).describe("Number of bars to return, newest last."),
  }),
  permission: "market:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const bars = await ctx.services.market.getBars(ctx.principal, input.instrumentId, input.interval, input.count);
    return { instrumentId: input.instrumentId, interval: input.interval, count: bars.length, bars, stats: summarize(bars) };
  },
});

/** `{ instruments, total }` — instrument search over symbol/name. */
export const searchInstruments = defineTool({
  name: "search_instruments",
  description:
    "Search the tradable instrument universe by free text (symbol or name) and optionally by asset class. Use it to resolve a name you only know informally into a platform instrument id before quoting or trading it.",
  schema: z.object({
    query: z.string().min(1).max(64).optional().describe("Free-text match against symbol and name."),
    assetClass: AssetClass.optional().describe("Restrict to equity, option, future, forex, crypto or event."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum instruments to return."),
  }),
  permission: "market:read",
  allowAdvisory: true,
  async execute(input, ctx) {
    const page = await ctx.services.market.listInstruments(
      ctx.principal,
      { search: input.query, assetClass: input.assetClass },
      { limit: input.limit, offset: 0 },
    );
    return { total: page.total, instruments: page.items.map(summarizeInstrument) };
  },
});

function summarizeInstrument(i: Instrument): Record<string, unknown> {
  return {
    id: i.id,
    symbol: i.symbol,
    name: i.name,
    assetClass: i.assetClass,
    broker: i.broker,
    venue: i.venue,
    currency: i.currency,
    multiplier: i.multiplier,
    tickSize: i.tickSize,
    lotSize: i.lotSize,
    tradable: i.tradable,
  };
}

function summarize(bars: ReadonlyArray<{ close: number; high: number; low: number; volume: number }>): Record<string, unknown> | null {
  if (bars.length === 0) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  return {
    firstClose: first,
    lastClose: last,
    changePct: first === 0 ? 0 : (last - first) / first,
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
    averageVolume: bars.reduce((a, b) => a + b.volume, 0) / bars.length,
  };
}

export const MARKET_TOOLS: readonly ToolDefinition[] = [getMarketOverview, getQuotes, getBars, searchInstruments];
