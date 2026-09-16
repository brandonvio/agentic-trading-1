/**
 * Open (and a few closed) positions per portfolio.
 *
 * Each portfolio has a hand-picked universe drawn strictly from its mandate's
 * asset classes; positions are sized to a gross leverage target below the
 * mandate cap and no single position exceeds the concentration limit.
 */
import type { Position } from "@/lib/domain/portfolio";
import type { Strategy } from "@/lib/domain/strategy";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, roundToTick, type InstrumentRef, type SeedContext } from "../context";
import type { InstrumentBundle } from "./instruments";
import type { BarBundle } from "./bars";
import type { PortfolioBundle, PortfolioCode } from "./portfolios";
import type { StrategyBundle } from "./strategies";
import { notionalUsd, quantityForNotional, unitValueUsd } from "./sizing";

interface BookSpec {
  portfolio: PortfolioCode;
  /** Gross notional as a multiple of NAV; must stay under the mandate cap. */
  grossLeverage: number;
  /** [symbol, weight, direction] — weight is a share of gross exposure. */
  legs: ReadonlyArray<readonly [string, number, 1 | -1]>;
}

const BOOKS: readonly BookSpec[] = [
  {
    portfolio: "GM-ALPHA",
    grossLeverage: 2.4,
    legs: [
      ["ESZ6", 0.14, 1], ["NQZ6", 0.09, 1], ["ZNZ6", 0.13, 1], ["ZBZ6", 0.08, -1],
      ["GCZ6", 0.1, 1], ["CLX6", 0.06, -1], ["6EZ6", 0.05, 1], ["EUR/USD", 0.08, 1],
      ["USD/JPY", 0.07, -1], ["GBP/USD", 0.04, 1], ["SPY", 0.05, 1], ["TLT", 0.05, 1],
      ["GLD", 0.03, 1], ["XLE", 0.03, -1],
    ],
  },
  {
    portfolio: "GM-CARRY",
    grossLeverage: 3.2,
    legs: [
      ["AUD/USD", 0.19, 1], ["NZD/USD", 0.15, 1], ["USD/JPY", 0.2, 1], ["USD/CHF", 0.16, 1],
      ["EUR/USD", 0.12, -1], ["GBP/USD", 0.08, 1], ["USD/CAD", 0.06, -1], ["EUR/JPY", 0.04, 1],
    ],
  },
  {
    portfolio: "EQD-VOL",
    grossLeverage: 1.6,
    legs: [
      ["SPY 261218P00600000", 0.14, -1], ["SPY 261218C00660000", 0.12, -1],
      ["SPY 261218P00560000", 0.06, 1], ["SPY 261218C00680000", 0.05, 1],
      ["QQQ 261218P00540000", 0.09, -1], ["QQQ 261218C00600000", 0.08, -1],
      ["NVDA 261016P00170000", 0.05, -1], ["AAPL 261120C00260000", 0.04, -1],
      ["SPY", 0.19, 1], ["QQQ", 0.11, 1], ["NVDA", 0.04, 1], ["AAPL", 0.03, 1],
    ],
  },
  {
    portfolio: "SYS-TREND",
    grossLeverage: 3.6,
    legs: [
      ["ESZ6", 0.11, 1], ["NQZ6", 0.1, 1], ["RTYZ6", 0.05, -1], ["YMZ6", 0.05, 1],
      ["CLX6", 0.08, -1], ["NGX6", 0.05, 1], ["GCZ6", 0.12, 1], ["SIZ6", 0.07, 1],
      ["HGZ6", 0.06, 1], ["ZNZ6", 0.13, 1], ["ZBZ6", 0.07, 1], ["6EZ6", 0.06, 1],
      ["6JZ6", 0.05, -1],
    ],
  },
  {
    portfolio: "DA-CORE",
    grossLeverage: 1.4,
    legs: [
      ["BTC-USD", 0.4, 1], ["ETH-USD", 0.24, 1], ["SOL-USD", 0.12, 1],
      ["LINK-USD", 0.08, 1], ["AVAX-USD", 0.06, -1], ["XRP-USD", 0.06, 1], ["DOGE-USD", 0.04, -1],
    ],
  },
  {
    portfolio: "DA-ARB",
    grossLeverage: 1.8,
    legs: [["BTC-USD", 0.34, 1], ["BTCZ6", 0.32, -1], ["ETH-USD", 0.18, 1], ["ETHZ6", 0.16, -1]],
  },
  {
    portfolio: "EV-MACRO",
    grossLeverage: 0.35,
    legs: [
      ["FED-DEC26-CUT", 0.22, 1], ["FED-SEP26-HOLD", 0.2, 1], ["FED-NOV26-CUT", 0.14, -1],
      ["CPI-SEP26-ABOVE3", 0.12, -1], ["SPX-YE26-6500", 0.14, 1],
      ["GDP-Q3-26-ABOVE2", 0.1, 1], ["ECB-OCT26-CUT", 0.08, 1],
    ],
  },
  {
    portfolio: "MS-FLAG",
    grossLeverage: 1.5,
    legs: [
      ["SPY", 0.14, 1], ["QQQ", 0.1, 1], ["ESZ6", 0.13, 1], ["GCZ6", 0.11, 1],
      ["EUR/USD", 0.12, 1], ["USD/JPY", 0.09, -1], ["BTC-USD", 0.12, 1], ["ETH-USD", 0.07, 1],
      ["SPY 261016P00600000", 0.05, -1], ["FED-DEC26-CUT", 0.04, 1], ["TLT", 0.03, 1],
    ],
  },
];

export interface PositionBundle {
  positions: Position[];
  /** Open positions for a portfolio, longest first. */
  byPortfolio: (portfolioId: string) => Position[];
}

/** The strategy that owns this instrument in this portfolio, if any. */
function owningStrategy(strategies: readonly Strategy[], portfolioId: string, instrumentId: string): string | null {
  const match = strategies.find(
    (s) => s.deployments.some((d) => d.portfolioId === portfolioId) && s.instrumentIds.includes(instrumentId),
  );
  return match ? match.id : null;
}

/** Entry price consistent with a plausible unrealised PnL for the holding period. */
function entryPrice(ctx: SeedContext, ref: InstrumentRef, direction: 1 | -1, holdDays: number): number {
  const drift = ctx.rng.normal(0.12, 1) * ref.vol * Math.sqrt(holdDays / 252);
  const raw = ref.price / (1 + direction * drift);
  const bounded = Math.min(Math.max(raw, ref.price * 0.55), ref.price * 1.65);
  return roundToTick(bounded, ref.instrument.tickSize);
}

/** Prior-session close per instrument, taken from the second-to-last daily bar. */
function previousCloses(bars: BarBundle): Map<string, number> {
  const latestTwo = new Map<string, number[]>();
  for (const bar of bars.daily) {
    const list = latestTwo.get(bar.instrumentId) ?? [];
    list.push(bar.close);
    latestTwo.set(bar.instrumentId, list);
  }
  const out = new Map<string, number>();
  for (const [instrumentId, closes] of latestTwo) {
    if (closes.length >= 2) out.set(instrumentId, closes[closes.length - 2]);
  }
  return out;
}

export function generatePositions(
  ctx: SeedContext,
  portfolios: PortfolioBundle,
  instruments: InstrumentBundle,
  strategies: StrategyBundle,
  bars: BarBundle,
): PositionBundle {
  const positions: Position[] = [];
  const priorCloses = previousCloses(bars);
  /** Charted instruments use their real prior bar; the rest get a plausible one. */
  const priorClose = (instrumentId: string, mark: number, tickSize: number): number =>
    priorCloses.get(instrumentId) ?? roundToTick(mark * (1 + ctx.rng.normal(0, 0.006)), tickSize);

  for (const book of BOOKS) {
    const portfolio = portfolios.portfolioByCode(book.portfolio);
    const grossTarget = portfolio.nav * book.grossLeverage;
    for (const [symbol, weight, direction] of book.legs) {
      const ref = instruments.refs.get(symbol);
      if (!ref) throw new Error(`Seed generation error: book ${book.portfolio} references unknown symbol ${symbol}`);
      const account = portfolios.accountFor(portfolio.id, ref.instrument.broker);
      const holdDays = ctx.rng.range(3, 90);
      const targetUsd = grossTarget * weight;
      const quantity = direction * quantityForNotional(ref, targetUsd);
      const averagePrice = entryPrice(ctx, ref, direction, holdDays);
      const markPrice = roundToTick(ref.price, ref.instrument.tickSize);
      const unit = unitValueUsd(ref.instrument, 1);
      const openedAt = ctx.tradingTime(ref.instrument.assetClass, holdDays, holdDays + 0.4);
      positions.push({
        id: ctx.ids.next(ID_PREFIX.position),
        portfolioId: portfolio.id,
        brokerAccountId: account.id,
        instrumentId: ref.instrument.id,
        symbol: ref.instrument.symbol,
        assetClass: ref.instrument.assetClass,
        quantity,
        averagePrice,
        markPrice,
        previousClose: priorClose(ref.instrument.id, markPrice, ref.instrument.tickSize),
        marketValue: notionalUsd(ref.instrument, markPrice, quantity),
        unrealizedPnl: round(quantity * (markPrice - averagePrice) * unit, 2),
        realizedPnl: round(Math.abs(quantity) * averagePrice * unit * ctx.rng.normal(0.004, 0.02), 2),
        strategyId: owningStrategy(strategies.strategies, portfolio.id, ref.instrument.id),
        openedAt,
        closedAt: null,
        createdAt: openedAt,
        updatedAt: ctx.hoursAgo(ctx.rng.range(0.05, 1.5)),
      });
    }
  }

  // A handful of recently closed positions so the "closed" filter has data.
  const closedSpecs: ReadonlyArray<readonly [PortfolioCode, string, 1 | -1, number]> = [
    ["GM-ALPHA", "RTYZ6", -1, 6.5],
    ["DA-CORE", "LTC-USD", 1, 11.2],
    ["SYS-TREND", "HGZ6", -1, 4.1],
    ["EQD-VOL", "SPY 261016C00640000", -1, 9.4],
  ];
  for (const [code, symbol, direction, daysAgo] of closedSpecs) {
    const portfolio = portfolios.portfolioByCode(code);
    const ref = instruments.refs.get(symbol);
    if (!ref) throw new Error(`Seed generation error: closed position references unknown symbol ${symbol}`);
    const account = portfolios.accountFor(portfolio.id, ref.instrument.broker);
    const quantity = direction * quantityForNotional(ref, portfolio.nav * 0.03);
    const averagePrice = entryPrice(ctx, ref, direction, 30);
    const exitPrice = roundToTick(ref.price * (1 + ctx.rng.normal(0, 0.02)), ref.instrument.tickSize);
    const openedAt = ctx.tradingTime(ref.instrument.assetClass, daysAgo + 25, daysAgo + 26);
    const closedAt = ctx.tradingTime(ref.instrument.assetClass, daysAgo, daysAgo + 0.3);
    positions.push({
      id: ctx.ids.next(ID_PREFIX.position),
      portfolioId: portfolio.id,
      brokerAccountId: account.id,
      instrumentId: ref.instrument.id,
      symbol: ref.instrument.symbol,
      assetClass: ref.instrument.assetClass,
      quantity: 0,
      averagePrice,
      markPrice: exitPrice,
      previousClose: priorClose(ref.instrument.id, exitPrice, ref.instrument.tickSize),
      marketValue: 0,
      unrealizedPnl: 0,
      realizedPnl: round(quantity * (exitPrice - averagePrice) * unitValueUsd(ref.instrument, 1), 2),
      strategyId: owningStrategy(strategies.strategies, portfolio.id, ref.instrument.id),
      openedAt,
      closedAt,
      createdAt: openedAt,
      updatedAt: closedAt,
    });
  }

  const byPortfolio = (portfolioId: string): Position[] =>
    positions
      .filter((p) => p.portfolioId === portfolioId && p.closedAt === null)
      .sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));

  return { positions, byPortfolio };
}
