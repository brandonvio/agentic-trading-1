/** Strategies, deployments and backtests. */
import type { Strategy, Backtest, PerformanceStats, StrategyStatus, StrategyStyle } from "@/lib/domain/strategy";
import type { AssetClass } from "@/lib/domain/instrument";
import { ID_PREFIX } from "@/lib/core/ids";
import { DAY_MS, round, type SeedContext } from "../context";
import type { OrgBundle, DeskCode } from "./org";
import type { PortfolioBundle, PortfolioCode } from "./portfolios";
import type { InstrumentBundle } from "./instruments";

export type StrategyCode = "VRP" | "FXCARRY" | "TREND" | "BASIS" | "FEDPATH" | "EARNSTR" | "CMOM" | "MRES" | "MACRO" | "EVMIS";

interface StrategySpec {
  code: StrategyCode;
  name: string;
  description: string;
  thesis: string;
  style: StrategyStyle;
  assetClasses: AssetClass[];
  symbols: string[];
  status: StrategyStatus;
  ownerEmail: string;
  desk: DeskCode;
  deployments: Array<{ portfolio: PortfolioCode; capital: number; daysAgo: number }>;
  parameters: Record<string, number | string | boolean>;
  backtest: Omit<PerformanceStats, "asOf"> | null;
  live: Omit<PerformanceStats, "asOf"> | null;
  version: number;
  createdDaysAgo: number;
}

const STRATEGY_SPECS: readonly StrategySpec[] = [
  {
    code: "VRP",
    name: "Vol Risk Premium (SPY/QQQ)",
    description: "Systematically short 30-60 day index variance, delta hedged daily, with 10-delta wings.",
    thesis:
      "Implied volatility on US equity indices has exceeded subsequently realised volatility in roughly 85% of rolling 30-day windows since 2010, with the gap widest when VIX is between 14 and 22 and the term structure is in contango. The strategy sells 30-60 day SPY and QQQ strangles at 25-delta, hedges delta at the close, and buys 10-delta puts so the maximum loss per expiry cycle is bounded at 1.8% of allocated capital. Positions are cut by half when 5-day realised vol exceeds implied by more than four points.",
    style: "volatility_arbitrage",
    assetClasses: ["option", "equity"],
    symbols: ["SPY", "QQQ", "SPY 261218P00600000", "SPY 261218P00560000", "SPY 261218C00680000", "QQQ 261218P00540000", "QQQ 261218C00600000", "SPY 261016P00600000", "SPY 261016C00640000"],
    status: "live",
    ownerEmail: "daniel.reyes@agenticprop.io",
    desk: "EQD",
    deployments: [{ portfolio: "EQD-VOL", capital: 250_000_000, daysAgo: 300 }],
    parameters: { targetDelta: 0.25, wingDelta: 0.1, tenorDaysMin: 30, tenorDaysMax: 60, hedgeFrequency: "daily_close", vixEntryMin: 14, vixEntryMax: 22, maxLossPctPerCycle: 0.018 },
    backtest: { sharpe: 1.62, sortino: 2.31, annualizedReturnPct: 11.4, maxDrawdownPct: -9.8, winRatePct: 71.2, profitFactor: 1.94, tradeCount: 812 },
    live: { sharpe: 1.38, sortino: 1.95, annualizedReturnPct: 9.6, maxDrawdownPct: -6.1, winRatePct: 68.4, profitFactor: 1.71, tradeCount: 214 },
    version: 4,
    createdDaysAgo: 360,
  },
  {
    code: "FXCARRY",
    name: "FX Carry G10",
    description: "Long the three highest-yielding G10 currencies against the three lowest, vol-targeted, with a momentum filter.",
    thesis:
      "Forward rates are biased predictors of future spot: high-yield currencies do not, on average, depreciate enough to offset their rate advantage. A G10 carry basket earns roughly 4-6% per year of pure carry with a Sharpe near 0.7 before overlays. Drawdowns cluster in risk-off shocks, so the basket is scaled to an 8% volatility target, halved when the 1-month FX vol index rises above its 80th percentile, and each leg must be confirmed by 3-month price momentum in the direction of carry.",
    style: "carry",
    assetClasses: ["forex"],
    symbols: ["AUD/USD", "NZD/USD", "USD/JPY", "USD/CHF", "GBP/USD", "EUR/USD", "EUR/JPY", "USD/CAD"],
    status: "live",
    ownerEmail: "elena.varga@agenticprop.io",
    desk: "GM",
    deployments: [{ portfolio: "GM-CARRY", capital: 300_000_000, daysAgo: 340 }],
    parameters: { longLegs: 3, shortLegs: 3, volTargetPct: 8, volFilterPercentile: 80, momentumLookbackDays: 63, rebalanceDay: "friday" },
    backtest: { sharpe: 0.94, sortino: 1.22, annualizedReturnPct: 7.8, maxDrawdownPct: -12.4, winRatePct: 56.1, profitFactor: 1.42, tradeCount: 1_240 },
    live: { sharpe: 1.05, sortino: 1.4, annualizedReturnPct: 8.3, maxDrawdownPct: -5.7, winRatePct: 57.9, profitFactor: 1.51, tradeCount: 386 },
    version: 2,
    createdDaysAgo: 370,
  },
  {
    code: "TREND",
    name: "Trend Following Futures",
    description: "Multi-horizon (20/60/120 day) breakout and moving-average trend model across 14 liquid futures.",
    thesis:
      "Persistent trends in futures markets arise from slow diffusion of macro information and from investor under-reaction; a diversified ensemble of 20, 60 and 120-day trend signals captures them with low correlation to equities and positive convexity in crises. Each market is sized to contribute equal risk (inverse ATR), the portfolio is scaled to a 12% annual volatility target, and positions are held until the ensemble signal flips or an 3-ATR trailing stop is hit.",
    style: "trend_following",
    assetClasses: ["future"],
    symbols: ["ESZ6", "NQZ6", "RTYZ6", "CLX6", "NGX6", "GCZ6", "SIZ6", "HGZ6", "ZNZ6", "ZBZ6", "6EZ6", "6JZ6", "YMZ6"],
    status: "live",
    ownerEmail: "priya.raghunathan@agenticprop.io",
    desk: "SYS",
    deployments: [
      { portfolio: "SYS-TREND", capital: 500_000_000, daysAgo: 380 },
      { portfolio: "MS-FLAG", capital: 60_000_000, daysAgo: 110 },
    ],
    parameters: { lookbacks: "20,60,120", volTargetPct: 12, atrStopMultiple: 3, riskParity: true, maxMarketRiskPct: 0.25, rebalanceTime: "16:00 ET" },
    backtest: { sharpe: 1.08, sortino: 1.55, annualizedReturnPct: 13.9, maxDrawdownPct: -17.2, winRatePct: 41.3, profitFactor: 1.66, tradeCount: 2_140 },
    live: { sharpe: 1.21, sortino: 1.78, annualizedReturnPct: 14.7, maxDrawdownPct: -8.9, winRatePct: 43.8, profitFactor: 1.72, tradeCount: 672 },
    version: 6,
    createdDaysAgo: 395,
  },
  {
    code: "BASIS",
    name: "BTC/ETH Basis Arb",
    description: "Cash-and-carry: long spot on Coinbase, short CME quarterly futures when annualised basis exceeds funding cost plus 3%.",
    thesis:
      "CME bitcoin and ether futures trade at a persistent premium to spot that has averaged 8-14% annualised over the last three years, driven by constrained leverage for regulated buyers. Buying spot and selling the quarterly future locks in that basis with no directional exposure; the trade is entered when annualised basis exceeds the firm's funding cost plus a 3% hurdle and unwound when it compresses below 2% or at expiry. Margin on the futures leg is the main risk: the book keeps 40% of allocated capital as unencumbered cash to absorb a 35% rally without a margin call.",
    style: "statistical_arbitrage",
    assetClasses: ["crypto", "future"],
    symbols: ["BTC-USD", "ETH-USD", "BTCZ6", "ETHZ6"],
    status: "paused",
    ownerEmail: "kenji.watanabe@agenticprop.io",
    desk: "DA",
    deployments: [{ portfolio: "DA-ARB", capital: 150_000_000, daysAgo: 280 }],
    parameters: { entryBasisAnnualizedPct: 3, exitBasisAnnualizedPct: 2, fundingCostPct: 5.1, cashBufferPct: 40, maxRallyBufferPct: 35 },
    backtest: { sharpe: 2.84, sortino: 4.1, annualizedReturnPct: 9.2, maxDrawdownPct: -2.1, winRatePct: 92.5, profitFactor: 6.3, tradeCount: 96 },
    live: { sharpe: 2.41, sortino: 3.6, annualizedReturnPct: 8.1, maxDrawdownPct: -1.6, winRatePct: 90, profitFactor: 5.4, tradeCount: 41 },
    version: 3,
    createdDaysAgo: 290,
  },
  {
    code: "FEDPATH",
    name: "Fed Path Probabilities",
    description: "Trades Kalshi FOMC contracts against a rates-market-implied probability model.",
    thesis:
      "Kalshi FOMC contracts are priced by a retail-heavy order book that lags the fed funds futures curve by hours to days after data releases. A probability model built from SOFR futures, the Fed's dot plot and the desk's nowcast produces a fair value for each meeting contract; the strategy buys YES or NO when the Kalshi price deviates by more than 6 points from fair value and the gap has persisted for 30 minutes, closing when it converges within 2 points or on the meeting day. Position size is capped at 4% of NAV per meeting.",
    style: "event_probability",
    assetClasses: ["event"],
    symbols: ["FED-DEC26-CUT", "FED-SEP26-HOLD", "FED-NOV26-CUT", "CPI-SEP26-ABOVE3", "UNEMP-OCT26-ABOVE45"],
    status: "live",
    ownerEmail: "sofia.marchetti@agenticprop.io",
    desk: "EV",
    deployments: [{ portfolio: "EV-MACRO", capital: 60_000_000, daysAgo: 250 }],
    parameters: { entryEdgePoints: 6, exitEdgePoints: 2, persistenceMinutes: 30, maxPctNavPerMeeting: 0.04, model: "sofr_dots_nowcast_v3" },
    backtest: { sharpe: 1.74, sortino: 2.6, annualizedReturnPct: 18.6, maxDrawdownPct: -7.4, winRatePct: 63.2, profitFactor: 2.12, tradeCount: 338 },
    live: { sharpe: 1.52, sortino: 2.2, annualizedReturnPct: 15.1, maxDrawdownPct: -4.8, winRatePct: 61.5, profitFactor: 1.89, tradeCount: 117 },
    version: 3,
    createdDaysAgo: 260,
  },
  {
    code: "EARNSTR",
    name: "Earnings Straddles",
    description: "Buys ATM straddles two days before mega-cap earnings when implied move is below the 3-year realised average.",
    thesis:
      "For the largest US technology names, the options market has under-priced the earnings-day move in around 58% of events since 2021 when the implied move is below the trailing 12-event average realised move. Buying the nearest-expiry ATM straddle two sessions before the print and closing at the next open captures the gap; losses are capped at premium paid and the book is limited to three concurrent names. Currently trading paper to validate slippage assumptions in the mock fills.",
    style: "volatility_arbitrage",
    assetClasses: ["option"],
    symbols: ["NVDA 261016C00185000", "NVDA 261016P00185000", "AAPL 261120C00250000", "AAPL 261120P00230000", "TSLA 261016C00340000", "TSLA 261016P00300000"],
    status: "paper",
    ownerEmail: "isabelle.fournier@agenticprop.io",
    desk: "EQD",
    deployments: [{ portfolio: "EQD-VOL", capital: 20_000_000, daysAgo: 45 }],
    parameters: { entryDaysBefore: 2, impliedVsRealizedRatioMax: 0.9, maxConcurrentNames: 3, exitTiming: "next_open", universe: "NVDA,AAPL,TSLA,MSFT,AMZN,META,GOOGL" },
    backtest: { sharpe: 1.12, sortino: 1.7, annualizedReturnPct: 14.2, maxDrawdownPct: -11.3, winRatePct: 57.6, profitFactor: 1.48, tradeCount: 164 },
    live: null,
    version: 2,
    createdDaysAgo: 90,
  },
  {
    code: "CMOM",
    name: "Momentum Crypto L/S",
    description: "Cross-sectional 30-day momentum across the ten most liquid Coinbase pairs, long top three / short bottom three.",
    thesis:
      "Cross-sectional momentum in large-cap crypto is stronger and faster-decaying than in equities: the top tercile by 30-day return outperforms the bottom tercile by roughly 2.5% per week with a 2-week half-life. The strategy rebalances every Monday at 00:00 UTC into long the three strongest and short the three weakest pairs, dollar-neutral within the overlay, with a hard 25% stop per name and a book-level kill switch at a 12% drawdown from the trailing 30-day peak.",
    style: "momentum",
    assetClasses: ["crypto"],
    symbols: ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "AVAX-USD", "LINK-USD", "ADA-USD", "DOT-USD", "LTC-USD"],
    status: "live",
    ownerEmail: "kenji.watanabe@agenticprop.io",
    desk: "DA",
    deployments: [{ portfolio: "DA-CORE", capital: 180_000_000, daysAgo: 200 }],
    parameters: { lookbackDays: 30, longCount: 3, shortCount: 3, rebalance: "monday_00utc", perNameStopPct: 0.25, killSwitchDrawdownPct: 0.12 },
    backtest: { sharpe: 1.31, sortino: 1.9, annualizedReturnPct: 34.5, maxDrawdownPct: -22.7, winRatePct: 52.4, profitFactor: 1.58, tradeCount: 1_020 },
    live: { sharpe: 1.18, sortino: 1.66, annualizedReturnPct: 27.9, maxDrawdownPct: -14.3, winRatePct: 51.1, profitFactor: 1.44, tradeCount: 286 },
    version: 5,
    createdDaysAgo: 210,
  },
  {
    code: "MRES",
    name: "Mean Reversion ES",
    description: "Intraday mean reversion in E-mini S&P after 2-sigma opening-range extensions.",
    thesis:
      "Moves of more than two standard deviations from the opening 30-minute range in ES revert toward VWAP by 11:30 ET in roughly 62% of sessions when there is no scheduled macro release before noon. Fading the extension with a VWAP target and a 1.5-ATR stop yields a modest but uncorrelated intraday return stream. Backtest is complete; awaiting a paper allocation pending the CIO's review of overnight-gap handling.",
    style: "mean_reversion",
    assetClasses: ["future"],
    symbols: ["ESZ6"],
    status: "backtested",
    ownerEmail: "wei.zhang@agenticprop.io",
    desk: "SYS",
    deployments: [],
    parameters: { openingRangeMinutes: 30, entrySigma: 2.0, target: "vwap", stopAtrMultiple: 1.5, flatBy: "11:30 ET", skipOnMacroRelease: true },
    backtest: { sharpe: 1.44, sortino: 2.05, annualizedReturnPct: 9.1, maxDrawdownPct: -6.3, winRatePct: 61.8, profitFactor: 1.52, tradeCount: 396 },
    live: null,
    version: 1,
    createdDaysAgo: 60,
  },
  {
    code: "MACRO",
    name: "Macro Discretionary Overlay",
    description: "Discretionary macro themes expressed through rates, FX and index futures; positions proposed by the PM agent and approved by Elena Varga.",
    thesis:
      "The desk runs three to five macro themes at a time, each anchored on a divergence between market pricing and the desk's view of central bank reaction functions. Current themes: a softer US labour market pulling the Fed toward a December cut (long ZN, short USD/JPY), European growth re-acceleration on fiscal expansion (long EUR/USD, long 6E), and elevated equity valuations with narrow breadth (short RTY against long SPY). Each theme is sized to lose no more than 1% of NAV at its stop level.",
    style: "macro_discretionary",
    assetClasses: ["forex", "future", "equity"],
    symbols: ["EUR/USD", "USD/JPY", "AUD/USD", "GBP/USD", "ESZ6", "ZNZ6", "GCZ6", "6EZ6", "CLX6", "RTYZ6", "SPY", "TLT", "GLD", "XLE"],
    status: "live",
    ownerEmail: "elena.varga@agenticprop.io",
    desk: "GM",
    deployments: [
      { portfolio: "GM-ALPHA", capital: 400_000_000, daysAgo: 390 },
      { portfolio: "MS-FLAG", capital: 80_000_000, daysAgo: 110 },
    ],
    parameters: { maxThemes: 5, maxLossPerThemePctNav: 0.01, reviewCadence: "weekly", approvalRequired: true },
    backtest: null,
    live: { sharpe: 0.88, sortino: 1.21, annualizedReturnPct: 10.4, maxDrawdownPct: -7.9, winRatePct: 54.0, profitFactor: 1.39, tradeCount: 158 },
    version: 9,
    createdDaysAgo: 395,
  },
  {
    code: "EVMIS",
    name: "Event Probability Mispricing",
    description: "Research: cross-market consistency checks between Kalshi contracts and related listed markets (e.g. SPX threshold vs. option-implied distribution).",
    thesis:
      "Kalshi contracts on index levels, inflation prints and macro thresholds should be consistent with option-implied distributions, TIPS breakevens and economists' consensus. Where the Kalshi price implies a probability more than 8 points away from the listed-market-implied probability, the contract is a candidate trade. Early results show the edge is concentrated in contracts with less than $500k open interest, which limits capacity; the research agent is evaluating whether the edge survives realistic fill assumptions.",
    style: "event_probability",
    assetClasses: ["event"],
    symbols: ["SPX-YE26-6500", "BTC-120K-2026", "USREC-2026", "GDP-Q3-26-ABOVE2", "ECB-OCT26-CUT"],
    status: "research",
    ownerEmail: "sofia.marchetti@agenticprop.io",
    desk: "EV",
    deployments: [],
    parameters: { edgeThresholdPoints: 8, maxOpenInterestUsd: 500_000, referenceMarkets: "options,tips,consensus" },
    backtest: null,
    live: null,
    version: 1,
    createdDaysAgo: 30,
  },
];

export interface StrategyBundle {
  strategies: Strategy[];
  backtests: Backtest[];
  strategyByCode: (code: StrategyCode) => Strategy;
}

function equityCurve(ctx: SeedContext, from: string, to: string, initial: number, annualReturnPct: number, sharpe: number): Array<[string, number]> {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const weeks = Math.floor((end - start) / (7 * DAY_MS));
  const annualVol = annualReturnPct / 100 / sharpe;
  const weeklyDrift = annualReturnPct / 100 / 52;
  const weeklyVol = annualVol / Math.sqrt(52);
  const curve: Array<[string, number]> = [];
  let equity = initial;
  for (let w = 0; w <= weeks; w++) {
    const t = new Date(start + w * 7 * DAY_MS).toISOString();
    curve.push([t, round(equity, 2)]);
    equity *= 1 + weeklyDrift + ctx.rng.normal(0, weeklyVol);
  }
  return curve;
}

export function generateStrategies(ctx: SeedContext, org: OrgBundle, portfolios: PortfolioBundle, instruments: InstrumentBundle): StrategyBundle {
  const statsAsOf = ctx.hoursAgo(14);
  const strategies: Strategy[] = STRATEGY_SPECS.map((s) => {
    const createdAt = ctx.daysAgo(s.createdDaysAgo);
    return {
      id: ctx.ids.next(ID_PREFIX.strategy),
      code: s.code,
      name: s.name,
      description: s.description,
      thesis: s.thesis,
      style: s.style,
      assetClasses: s.assetClasses,
      instrumentIds: s.symbols.map((sym) => {
        const ref = instruments.refs.get(sym);
        if (!ref) throw new Error(`Seed generation error: strategy ${s.code} references unknown symbol ${sym}`);
        return ref.instrument.id;
      }),
      status: s.status,
      ownerUserId: org.userByEmail(s.ownerEmail).id,
      deskId: org.deskByCode(s.desk).id,
      deployments: s.deployments.map((d) => ({
        portfolioId: portfolios.portfolioByCode(d.portfolio).id,
        allocatedCapital: d.capital,
        deployedAt: ctx.daysAgo(d.daysAgo),
      })),
      parameters: s.parameters,
      backtest: s.backtest ? { ...s.backtest, asOf: statsAsOf } : null,
      live: s.live ? { ...s.live, asOf: statsAsOf } : null,
      version: s.version,
      createdAt,
      updatedAt: ctx.daysAgo(Math.min(s.createdDaysAgo, ctx.rng.int(1, 20))),
    };
  });

  const strategyByCode = (code: StrategyCode): Strategy => {
    const st = strategies.find((x) => x.code === code);
    if (!st) throw new Error(`Seed generation error: unknown strategy ${code}`);
    return st;
  };

  const backtestTargets: Array<{ code: StrategyCode; requester: string; daysAgo: number; summary: string }> = [
    { code: "VRP", requester: "daniel.reyes@agenticprop.io", daysAgo: 75, summary: "Two-year walk-forward with daily delta hedging and 10-delta wings. Sharpe 1.62; worst cycle was the August 2024 vol spike (-6.9% in three sessions) which the wings capped as designed." },
    { code: "FXCARRY", requester: "elena.varga@agenticprop.io", daysAgo: 120, summary: "Momentum-filtered G10 carry. Filter removed 38% of the drawdown of the naive basket; returns concentrated in AUD, NZD and USD/JPY legs." },
    { code: "TREND", requester: "priya.raghunathan@agenticprop.io", daysAgo: 40, summary: "Version 6 ensemble (20/60/120). Adding the 120-day horizon improved crisis convexity; rates trends contributed 41% of profit." },
    { code: "BASIS", requester: "kenji.watanabe@agenticprop.io", daysAgo: 200, summary: "Cash-and-carry with quarterly roll. 96 round trips, 92% positive; the only losses came from early unwinds during the March 2025 basis compression." },
    { code: "MRES", requester: "wei.zhang@agenticprop.io", daysAgo: 12, summary: "Opening-range fade on ES with macro-release filter. 396 trades, 61.8% win rate. Skipping FOMC/CPI/NFP mornings raised profit factor from 1.21 to 1.52." },
    { code: "CMOM", requester: "isabelle.fournier@agenticprop.io", daysAgo: 55, summary: "Weekly cross-sectional momentum, 10-pair universe. Edge decays after two weeks; Monday 00:00 UTC rebalance beat Friday close by 3.1% annualised net of fees." },
  ];

  const backtests: Backtest[] = backtestTargets.map((b) => {
    const strategy = strategyByCode(b.code);
    const stats = strategy.backtest;
    const createdAt = ctx.daysAgo(b.daysAgo);
    const to = ctx.daysAgo(b.daysAgo + 1).slice(0, 10) + "T00:00:00.000Z";
    const from = new Date(new Date(to).getTime() - 730 * DAY_MS).toISOString();
    const initial = 100_000_000;
    return {
      id: ctx.ids.next(ID_PREFIX.backtest),
      strategyId: strategy.id,
      requestedByUserId: org.userByEmail(b.requester).id,
      from,
      to,
      initialCapital: initial,
      parameters: strategy.parameters,
      status: "completed",
      stats: stats ? { ...stats, asOf: createdAt } : null,
      equityCurve: stats ? equityCurve(ctx, from, to, initial, stats.annualizedReturnPct, stats.sharpe) : [],
      summary: b.summary,
      createdAt,
      updatedAt: ctx.shift(createdAt, 1_000 * 60 * ctx.rng.int(4, 40)),
    };
  });

  return { strategies, backtests, strategyByCode };
}
