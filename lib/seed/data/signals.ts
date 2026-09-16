/**
 * Trade ideas produced by the signal agents and by the live strategies
 * themselves. Agent-produced signals are attached to the run that published
 * them; strategy-produced signals carry no agent.
 */
import type { AgentRun, Signal, SignalDirection, SignalStatus } from "@/lib/domain/agent";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, roundToTick, type SeedContext } from "../context";
import type { InstrumentBundle } from "./instruments";
import type { PortfolioBundle, PortfolioCode } from "./portfolios";
import type { StrategyBundle, StrategyCode } from "./strategies";
import type { AgentBundle } from "./agents";
import { quantityForNotional } from "./sizing";

type Factor = readonly [string, number, string];

interface SignalSpec {
  symbol: string;
  portfolio: PortfolioCode;
  strategy: StrategyCode;
  /** Agent key that published it, or null for a strategy-generated signal. */
  agentKey: string | null;
  direction: SignalDirection;
  conviction: number;
  expectedReturnPct: number;
  horizonHours: number;
  notionalPctNav: number;
  status: SignalStatus;
  ageHours: number;
  thesis: string;
  factors: readonly Factor[];
}

const SPECS: readonly SignalSpec[] = [
  { symbol: "SPY 261218P00600000", portfolio: "EQD-VOL", strategy: "VRP", agentKey: "skew-signal", direction: "SHORT", conviction: 0.71, expectedReturnPct: 0.052, horizonHours: 720, notionalPctNav: 0.03, status: "acted", ageHours: 30,
    thesis: "Thirty-day implied volatility on SPY sits at 17.1% against 12.4% realised over the last twenty sessions, a 4.7 point premium that ranks in the 91st percentile of the past year. The put wing is bid because of index hedging into the September expiry rather than any deterioration in breadth, and the term structure remains in contango. Selling the 600 strike put against the 560 wing captures the premium with the tail loss bounded at 1.8% of allocated capital.",
    factors: [["implied_minus_realised", 0.45, "17.1% implied vs 12.4% realised, 91st percentile of trailing year"], ["term_structure_slope", 0.3, "Contango of 1.9 points between the front and second expiry"], ["put_skew", 0.25, "25-delta put skew 3.1 points rich to its 60-day median"]] },
  { symbol: "SPY 261218C00660000", portfolio: "EQD-VOL", strategy: "VRP", agentKey: "skew-signal", direction: "SHORT", conviction: 0.64, expectedReturnPct: 0.041, horizonHours: 720, notionalPctNav: 0.025, status: "acted", ageHours: 34,
    thesis: "The call side of the December strangle is cheaper than the put but still carries a two-point premium to realised. Call skew has flattened as systematic call overwriting supply returned after the summer, and dealer gamma above 660 is long, which dampens upside acceleration. Selling the 660 call against the 680 wing completes the strangle and balances the structure's delta at inception.",
    factors: [["call_skew_flattening", 0.4, "25-delta call skew 1.2 points below its 60-day median"], ["dealer_gamma", 0.35, "Estimated dealer gamma long above the 660 strike"], ["premium_to_realised", 0.25, "Two-point premium of implied over 20-day realised"]] },
  { symbol: "QQQ 261218P00540000", portfolio: "EQD-VOL", strategy: "VRP", agentKey: "skew-signal", direction: "SHORT", conviction: 0.58, expectedReturnPct: 0.047, horizonHours: 720, notionalPctNav: 0.02, status: "new", ageHours: 5,
    thesis: "Nasdaq implied volatility carries a wider premium than the S&P equivalent because of single-name earnings risk that does not fully transmit to the index. Realised correlation across the top ten names has fallen to 0.38, which mechanically caps index realised volatility while implied has not adjusted. The 540 put is the cleanest expression of that dispersion at the December tenor.",
    factors: [["implied_minus_realised", 0.4, "22.4% implied vs 16.9% realised on QQQ"], ["realised_correlation", 0.35, "Top-ten realised correlation at 0.38 versus 0.55 one-year average"], ["earnings_calendar", 0.25, "No index-weight earnings inside the tenor"]] },
  { symbol: "NVDA 261016P00170000", portfolio: "EQD-VOL", strategy: "EARNSTR", agentKey: null, direction: "SHORT", conviction: 0.49, expectedReturnPct: 0.068, horizonHours: 336, notionalPctNav: 0.008, status: "dismissed", ageHours: 96,
    thesis: "The October straddle prices a 9.4% earnings move against an eight-quarter realised average of 6.8%, a gap the earnings strategy would normally sell. The dismissal is a sizing decision rather than a disagreement with the edge: single-name gap risk in the largest index weight is not something the volatility book should carry into a print while the index strangle is already on.",
    factors: [["implied_move_vs_realised", 0.5, "9.4% implied move vs 6.8% eight-quarter average"], ["position_overlap", 0.3, "Index short strangle already carries correlated vega"], ["gap_risk", 0.2, "Largest single-name gap in the book at 4.1% of NAV"]] },
  { symbol: "SPY", portfolio: "EQD-VOL", strategy: "VRP", agentKey: "skew-signal", direction: "LONG", conviction: 0.55, expectedReturnPct: 0.004, horizonHours: 24, notionalPctNav: 0.012, status: "acted", ageHours: 8,
    thesis: "The strangle book has drifted to a net short delta of 0.61% of NAV after the overnight rally, outside the plus or minus 0.5% tolerance the mandate sets. Buying SPY shares is the cheapest and most liquid way to bring the hedge back inside band before the close. This is a hedge, not a directional view.",
    factors: [["delta_drift", 0.6, "Book delta at -0.61% of NAV against a 0.50% tolerance"], ["hedge_liquidity", 0.25, "SPY spread at 0.6 basis points with full size on the touch"], ["cost_of_carry", 0.15, "Financing cost immaterial over a one-day hedge"]] },

  { symbol: "AUD/USD", portfolio: "GM-CARRY", strategy: "FXCARRY", agentKey: "carry-signal", direction: "LONG", conviction: 0.66, expectedReturnPct: 0.021, horizonHours: 720, notionalPctNav: 0.5, status: "acted", ageHours: 52,
    thesis: "The Australian dollar offers the highest carry-to-volatility ratio in the G10 at 0.61 after the Reserve Bank's decision to hold while the market prices two cuts elsewhere. Three-month price momentum is positive and therefore confirms the carry sign, which is the filter that historically removed 38% of the naive basket's drawdown. Terms of trade have also improved with iron ore firm.",
    factors: [["carry_to_vol", 0.45, "Annualised carry 3.1% against 5.1% implied volatility"], ["momentum_confirmation", 0.35, "Three-month price momentum positive at +2.4%"], ["terms_of_trade", 0.2, "Iron ore up 8% quarter to date"]] },
  { symbol: "NZD/USD", portfolio: "GM-CARRY", strategy: "FXCARRY", agentKey: "carry-signal", direction: "LONG", conviction: 0.58, expectedReturnPct: 0.018, horizonHours: 720, notionalPctNav: 0.38, status: "acted", ageHours: 52,
    thesis: "New Zealand remains the second-highest yielder in the basket with a policy rate that the market prices as on hold through year end. The momentum filter is marginal at +0.9% over three months, so the leg is sized at three quarters of its unfiltered weight. Correlation with the Australian leg is high, which the basket construction already penalises.",
    factors: [["carry_to_vol", 0.4, "Annualised carry 2.7% against 5.6% implied volatility"], ["momentum_confirmation", 0.3, "Three-month momentum marginally positive at +0.9%"], ["basket_correlation", 0.3, "0.82 correlation with the AUD leg, weight reduced accordingly"]] },
  { symbol: "USD/JPY", portfolio: "GM-CARRY", strategy: "FXCARRY", agentKey: "carry-signal", direction: "LONG", conviction: 0.62, expectedReturnPct: 0.024, horizonHours: 720, notionalPctNav: 0.52, status: "acted", ageHours: 51,
    thesis: "The yen remains the cheapest funding currency in the basket with the Bank of Japan's policy rate still far below every other G10 central bank. The carry is 4.2% annualised, the widest single-leg carry available, and three-month momentum agrees. The known risk is intervention: the leg is stopped 2.5% above spot rather than at the usual basket stop.",
    factors: [["funding_advantage", 0.5, "4.2% annualised carry, widest in the basket"], ["momentum_confirmation", 0.3, "Three-month momentum +3.1%"], ["intervention_risk", 0.2, "Tighter 2.5% stop applied versus the standard basket stop"]] },
  { symbol: "USD/CHF", portfolio: "GM-CARRY", strategy: "FXCARRY", agentKey: "carry-signal", direction: "LONG", conviction: 0.53, expectedReturnPct: 0.014, horizonHours: 720, notionalPctNav: 0.42, status: "new", ageHours: 3,
    thesis: "The Swiss franc is the second funding leg with a policy rate near zero and a central bank explicitly uncomfortable with currency strength. Carry is 3.4% annualised. Momentum is flat, which caps the leg at its minimum basket weight rather than excluding it, since the carry sign and the momentum sign do not conflict.",
    factors: [["funding_advantage", 0.45, "3.4% annualised carry against a near-zero policy rate"], ["momentum_neutral", 0.3, "Three-month momentum at -0.1%, no conflict with carry"], ["central_bank_stance", 0.25, "SNB commentary repeatedly flags franc strength"]] },
  { symbol: "EUR/USD", portfolio: "GM-CARRY", strategy: "FXCARRY", agentKey: "carry-signal", direction: "SHORT", conviction: 0.47, expectedReturnPct: 0.011, horizonHours: 720, notionalPctNav: 0.3, status: "expired", ageHours: 140,
    thesis: "The euro sits in the middle of the yield ranking and was proposed as a partial funding leg on a negative carry differential of 1.1%. The three-month momentum filter turned positive during the review window and the proposal was allowed to expire rather than being forced through, exactly as the filter is designed to do.",
    factors: [["carry_differential", 0.4, "Negative 1.1% carry against the dollar"], ["momentum_conflict", 0.4, "Momentum turned +1.6%, contradicting the carry sign"], ["basket_balance", 0.2, "Third funding leg would concentrate the short-euro exposure"]] },

  { symbol: "GCZ6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: "momentum-signal", direction: "LONG", conviction: 0.74, expectedReturnPct: 0.038, horizonHours: 1440, notionalPctNav: 0.42, status: "acted", ageHours: 20,
    thesis: "All three horizons of the trend ensemble agree on gold for the first time in seven weeks: the 20, 60 and 120-day signals are simultaneously long, which historically precedes the strongest sixth of the model's return distribution. Central bank buying has kept the market bid through dollar strength, an unusual divergence that suggests the flow is price-insensitive. Inverse-ATR sizing puts the position at 42% of NAV notional, well inside the 12% risk-contribution cap.",
    factors: [["ensemble_agreement", 0.5, "20/60/120-day signals all long, first alignment in seven weeks"], ["flow_divergence", 0.3, "Gold bid despite a 1.4% dollar rally over the same window"], ["volatility_regime", 0.2, "20-day ATR at 0.9% keeps the inverse-ATR weight generous"]] },
  { symbol: "ZNZ6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: "momentum-signal", direction: "LONG", conviction: 0.68, expectedReturnPct: 0.019, horizonHours: 1440, notionalPctNav: 0.5, status: "acted", ageHours: 20,
    thesis: "The ten-year note has broken its 60-day range high on a soft services print, turning the medium-horizon signal long while the 120-day signal was already there. Rates trends have contributed 41% of the model's profit over the backtest window and remain the highest-Sharpe sleeve. The 20-day signal is still flat, so the position is opened at two thirds of full weight.",
    factors: [["breakout_60d", 0.45, "Close above the 60-day range high by 0.4 ATR"], ["sleeve_quality", 0.3, "Rates sleeve Sharpe of 0.94 versus 0.71 portfolio average"], ["partial_agreement", 0.25, "20-day signal flat, weight scaled to two thirds"]] },
  { symbol: "CLX6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: "momentum-signal", direction: "SHORT", conviction: 0.61, expectedReturnPct: 0.026, horizonHours: 1440, notionalPctNav: 0.28, status: "acted", ageHours: 44,
    thesis: "Crude has broken the 20 and 60-day range lows with inventories building for a fifth consecutive week. The short is the model's largest energy allocation but the sleeve is capped at 15% of portfolio risk, which binds before the inverse-ATR weight does. The 120-day signal remains long, so this is a partial-agreement entry with a tighter trailing stop.",
    factors: [["breakout_20d_60d", 0.45, "Close below both the 20 and 60-day range lows"], ["inventory_trend", 0.3, "Fifth consecutive weekly build in commercial crude stocks"], ["horizon_conflict", 0.25, "120-day signal still long; 3-ATR trailing stop tightened to 2 ATR"]] },
  { symbol: "NQZ6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: "momentum-signal", direction: "LONG", conviction: 0.57, expectedReturnPct: 0.022, horizonHours: 1440, notionalPctNav: 0.32, status: "new", ageHours: 2,
    thesis: "Nasdaq futures remain in an established uptrend across all three horizons, but realised volatility has risen to 19.4% annualised which reduces the inverse-ATR weight by a fifth versus last month. The signal is a weight adjustment rather than a new entry. No action is required if the portfolio manager is content to let the position drift inside the rebalance band.",
    factors: [["trend_persistence", 0.4, "All three horizons long for 34 consecutive sessions"], ["volatility_scaling", 0.4, "Realised volatility at 19.4% cuts the target weight by 20%"], ["rebalance_band", 0.2, "Current weight is 1.1% from target, inside the 2% no-trade band"]] },
  { symbol: "SIZ6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: null, direction: "LONG", conviction: 0.52, expectedReturnPct: 0.041, horizonHours: 1440, notionalPctNav: 0.24, status: "acted", ageHours: 68,
    thesis: "Silver has followed gold through its 60-day breakout with a higher beta, which the ensemble reads as a confirming rather than an independent signal. The correlation penalty in the risk-parity weighting reduces the position to roughly half of what the raw signal strength would imply. Industrial demand from solar remains the fundamental support under the trend.",
    factors: [["breakout_confirmation", 0.4, "60-day breakout two sessions after gold's"], ["correlation_penalty", 0.35, "0.79 correlation with the gold leg halves the weight"], ["industrial_demand", 0.25, "Photovoltaic demand up 11% year over year"]] },
  { symbol: "6JZ6", portfolio: "SYS-TREND", strategy: "TREND", agentKey: null, direction: "SHORT", conviction: 0.44, expectedReturnPct: 0.014, horizonHours: 1440, notionalPctNav: 0.2, status: "expired", ageHours: 132,
    thesis: "The yen futures short was the mechanical counterpart to the dollar trend across the currency sleeve. It expired unacted because the position was already at target weight and the rebalance band was never breached during the signal's life. Retained in the log so the sleeve's signal-to-trade conversion rate stays measurable.",
    factors: [["currency_sleeve_trend", 0.5, "Dollar trend long across all three horizons"], ["no_trade_band", 0.35, "Position within 0.6% of target for the whole window"], ["expiry_proximity", 0.15, "Contract inside 100 days to expiry; roll scheduled separately"]] },

  { symbol: "BTC-USD", portfolio: "DA-CORE", strategy: "CMOM", agentKey: null, direction: "LONG", conviction: 0.69, expectedReturnPct: 0.055, horizonHours: 336, notionalPctNav: 0.12, status: "acted", ageHours: 26,
    thesis: "Bitcoin leads the weekly cross-sectional momentum ranking for the fourth consecutive week, with the spot ETF complex absorbing more supply than miners issue. Realised volatility has compressed to 42% annualised, the lowest since March, which historically precedes expansion rather than reversal. The core allocation is being topped up toward its strategic weight rather than traded tactically.",
    factors: [["cross_sectional_rank", 0.4, "First of ten in the weekly momentum ranking for four weeks"], ["supply_absorption", 0.35, "ETF net inflows exceed issuance by 2.1x over the month"], ["volatility_compression", 0.25, "42% realised volatility, lowest since March"]] },
  { symbol: "ETH-USD", portfolio: "DA-CORE", strategy: "CMOM", agentKey: null, direction: "LONG", conviction: 0.61, expectedReturnPct: 0.062, horizonHours: 336, notionalPctNav: 0.08, status: "acted", ageHours: 26,
    thesis: "Ether ranks third in the momentum screen and carries the additional support of a staking yield that has risen with network activity. The ETH/BTC ratio has stabilised after eight weeks of decline, which the model treats as a weak reversal confirmation rather than a fresh trend. Sized at two thirds of the Bitcoin leg to respect the core concentration rule.",
    factors: [["cross_sectional_rank", 0.35, "Third of ten in the weekly momentum ranking"], ["ratio_stabilisation", 0.35, "ETH/BTC flat over three weeks after an eight-week decline"], ["staking_yield", 0.3, "Staking yield up to 3.6% on higher network fees"]] },
  { symbol: "SOL-USD", portfolio: "DA-CORE", strategy: "CMOM", agentKey: null, direction: "LONG", conviction: 0.56, expectedReturnPct: 0.089, horizonHours: 336, notionalPctNav: 0.05, status: "new", ageHours: 6,
    thesis: "Solana is the strongest large-cap alt in the screen with network fee revenue at a six-month high and stablecoin float on the chain growing 14% over the month. The position is capped by the 8% single-alt rule well before the momentum weight binds. Liquidity on Coinbase supports a $5m clip inside the participation cap.",
    factors: [["cross_sectional_rank", 0.4, "Second of ten in the weekly momentum ranking"], ["network_activity", 0.35, "Fee revenue at a six-month high; stablecoin float up 14%"], ["liquidity", 0.25, "$5m executable inside the 1.5% book participation cap"]] },
  { symbol: "LINK-USD", portfolio: "DA-CORE", strategy: "CMOM", agentKey: null, direction: "LONG", conviction: 0.48, expectedReturnPct: 0.074, horizonHours: 336, notionalPctNav: 0.025, status: "acted", ageHours: 74,
    thesis: "Chainlink entered the top half of the momentum screen on the back of institutional integration announcements. Conviction is moderate because the move is news-driven rather than flow-driven, and the model's edge decays fastest in exactly that category. Position sized to the minimum tradable overlay weight.",
    factors: [["cross_sectional_rank", 0.35, "Fifth of ten, up from ninth two weeks ago"], ["news_driven_move", 0.35, "Move attributable to integration announcements, faster decay"], ["overlay_minimum", 0.3, "Sized at the 2.5% minimum overlay weight"]] },
  { symbol: "AVAX-USD", portfolio: "DA-CORE", strategy: "CMOM", agentKey: null, direction: "SHORT", conviction: 0.51, expectedReturnPct: 0.048, horizonHours: 336, notionalPctNav: 0.02, status: "dismissed", ageHours: 110,
    thesis: "Avalanche ranks last in the momentum screen and would be the natural short leg of the overlay. Dismissed by the portfolio manager because borrow on Coinbase Prime is not reliably available at size and the strategy is spot-only by mandate. The ranking is retained for the record so the screen's coverage stays complete.",
    factors: [["cross_sectional_rank", 0.45, "Tenth of ten in the weekly momentum ranking"], ["borrow_availability", 0.35, "No reliable borrow at size on Coinbase Prime"], ["mandate_constraint", 0.2, "DA-CORE mandate is spot-only"]] },

  { symbol: "ESZ6", portfolio: "GM-ALPHA", strategy: "MACRO", agentKey: null, direction: "SHORT", conviction: 0.59, expectedReturnPct: 0.017, horizonHours: 480, notionalPctNav: 0.06, status: "acted", ageHours: 14,
    thesis: "The equity index leg is the largest single position in the macro book at 33% of NAV notional against a 15% concentration limit. Trimming it is a risk decision that also happens to agree with the house view: the lower-real-yield theme is better expressed in duration than in equity beta. The trim leaves the theme intact while clearing the concentration warning.",
    factors: [["concentration", 0.5, "33% of NAV against a 15% single-instrument limit"], ["theme_expression", 0.3, "Duration is the cleaner expression of the house view"], ["valuation", 0.2, "Index forward multiple at the 88th percentile of five years"]] },
  { symbol: "ZNZ6", portfolio: "GM-ALPHA", strategy: "MACRO", agentKey: null, direction: "LONG", conviction: 0.72, expectedReturnPct: 0.023, horizonHours: 480, notionalPctNav: 0.09, status: "acted", ageHours: 14,
    thesis: "The soft euro area services print and a two basis point fall in ten-year yields on 18% above-average volume both point at a genuine repricing of the front end rather than a liquidity artefact. Adding duration in the ten-year note is the most liquid expression and keeps the book's net duration inside the desk budget. The stop sits below the 60-day range low.",
    factors: [["macro_surprise", 0.4, "Euro area services PMI 1.4 points below consensus"], ["volume_confirmation", 0.35, "Move on 18% above-average hourly volume"], ["budget_headroom", 0.25, "Net duration remains inside the desk's DV01 budget after the add"]] },
  { symbol: "EUR/USD", portfolio: "GM-ALPHA", strategy: "MACRO", agentKey: null, direction: "LONG", conviction: 0.54, expectedReturnPct: 0.015, horizonHours: 480, notionalPctNav: 0.04, status: "new", ageHours: 4,
    thesis: "Euro strength alongside a bid in gold is consistent with lower US real yields rather than a growth scare, which is the distinction that determines whether the macro book should be long or short the dollar here. The position is small because the carry works against it and the theme is already expressed through duration. Stop below the recent consolidation low.",
    factors: [["real_yield_differential", 0.45, "US ten-year real yield down four basis points on the week"], ["gold_corroboration", 0.3, "Gold up 0.4% on the same session, consistent with the real-yield read"], ["negative_carry", 0.25, "1.1% annualised carry cost caps the position size"]] },
  { symbol: "GCZ6", portfolio: "GM-ALPHA", strategy: "MACRO", agentKey: null, direction: "LONG", conviction: 0.63, expectedReturnPct: 0.028, horizonHours: 480, notionalPctNav: 0.05, status: "acted", ageHours: 40,
    thesis: "Gold is doing what it should in a lower-real-yield regime and central bank demand provides a price-insensitive bid underneath. The macro book holds it as a diversifier against the rates leg rather than as an independent theme, so the size is set by the correlation contribution rather than by conviction. Reviewed weekly against the real-yield path.",
    factors: [["real_yields", 0.4, "Ten-year TIPS yield down four basis points on the week"], ["official_demand", 0.35, "Reported central bank purchases at a three-quarter high"], ["diversification", 0.25, "Negative 0.31 correlation with the equity index leg"]] },

  { symbol: "FED-DEC26-CUT", portfolio: "EV-MACRO", strategy: "FEDPATH", agentKey: null, direction: "LONG", conviction: 0.67, expectedReturnPct: 0.11, horizonHours: 2160, notionalPctNav: 0.03, status: "acted", ageHours: 22,
    thesis: "The model built from SOFR futures, the dot plot and the desk nowcast puts the probability of a December cut at 71% against a Kalshi price of 62 cents, a nine-point gap that has persisted for over four hours. Kalshi's order book is retail-heavy and reliably lags the futures curve after data releases. The contract is bought toward the model probability with a close at convergence inside two points.",
    factors: [["model_vs_market", 0.5, "Model 71% versus market 62%, nine-point gap"], ["gap_persistence", 0.3, "Gap held for four hours, above the 30-minute threshold"], ["book_composition", 0.2, "Retail-heavy book lags the SOFR curve by hours"]] },
  { symbol: "CPI-SEP26-ABOVE3", portfolio: "EV-MACRO", strategy: "FEDPATH", agentKey: null, direction: "SHORT", conviction: 0.6, expectedReturnPct: 0.09, horizonHours: 960, notionalPctNav: 0.02, status: "acted", ageHours: 58,
    thesis: "The nowcast puts headline CPI at 2.7% year over year against a contract price implying a 31% chance of a print at or above 3.0%. Shelter disinflation is well established in the private rent series and the energy contribution is negative on base effects. Selling the YES side captures the eight-point gap, with the position capped at 2% of NAV per print.",
    factors: [["nowcast_gap", 0.45, "Nowcast 2.7% versus a 31% implied probability of 3.0% or above"], ["shelter_disinflation", 0.35, "Private rent series decelerating for six consecutive months"], ["base_effects", 0.2, "Energy contribution negative on year-ago comparisons"]] },
  { symbol: "FED-NOV26-CUT", portfolio: "EV-MACRO", strategy: "FEDPATH", agentKey: null, direction: "FLAT", conviction: 0.31, expectedReturnPct: 0.02, horizonHours: 1440, notionalPctNav: 0.01, status: "expired", ageHours: 150,
    thesis: "The November contract trades at 38 cents against a model probability of 41%, a three-point gap that is inside the six-point entry threshold. No trade is warranted. The signal is logged as flat so the strategy's coverage of the meeting calendar is complete and the conversion statistics are not biased by silent skips.",
    factors: [["gap_below_threshold", 0.6, "Three-point gap versus a six-point entry threshold"], ["meeting_proximity", 0.25, "Two months to the meeting; information still to arrive"], ["capacity", 0.15, "Open interest of $900k limits any position to under $2m"]] },

  { symbol: "SPY", portfolio: "MS-FLAG", strategy: "MACRO", agentKey: null, direction: "LONG", conviction: 0.5, expectedReturnPct: 0.012, horizonHours: 720, notionalPctNav: 0.03, status: "new", ageHours: 9,
    thesis: "The flagship sleeve takes a scaled allocation of every live strategy, so the macro book's equity expression arrives here at roughly a fifth of its parent size. The position is a mechanical consequence of the parent allocation rather than an independent view. It is reviewed only when the parent strategy changes its target weight.",
    factors: [["parent_allocation", 0.6, "20% scaled allocation of the MACRO strategy's index weight"], ["sleeve_diversification", 0.25, "Equity beta is the smallest of the sleeve's six exposures"], ["rebalance_cadence", 0.15, "Weekly review against parent target weights"]] },
  { symbol: "BTC-USD", portfolio: "MS-FLAG", strategy: "CMOM", agentKey: null, direction: "LONG", conviction: 0.55, expectedReturnPct: 0.05, horizonHours: 336, notionalPctNav: 0.04, status: "acted", ageHours: 30,
    thesis: "The crypto momentum sleeve arrives in the flagship at a quarter of its parent weight, which is the maximum the allocator mandate permits for a single alternative asset class. The underlying signal is the same fourth-consecutive-week momentum rank that drives the DA-CORE position. No independent crypto view is expressed at the flagship level.",
    factors: [["parent_allocation", 0.55, "25% scaled allocation of the CMOM strategy's Bitcoin weight"], ["mandate_cap", 0.3, "Crypto capped at 12% of flagship NAV by the allocator mandate"], ["signal_inheritance", 0.15, "Same momentum rank as the parent portfolio's position"]] },
];

export interface SignalBundle {
  signals: Signal[];
}

const SIDE_BY_DIRECTION = { LONG: "BUY", SHORT: "SELL", HEDGE: "SELL", FLAT: null } as const;

export function generateSignals(
  ctx: SeedContext,
  portfolios: PortfolioBundle,
  instruments: InstrumentBundle,
  strategies: StrategyBundle,
  agentBundle: AgentBundle,
  runs: AgentRun[],
): SignalBundle {
  const signals: Signal[] = [];
  for (const spec of SPECS) {
    const ref = instruments.refs.get(spec.symbol);
    if (!ref) throw new Error(`Seed generation error: signal references unknown symbol ${spec.symbol}`);
    const portfolio = portfolios.portfolioByCode(spec.portfolio);
    const strategy = strategies.strategyByCode(spec.strategy);
    const agent = spec.agentKey ? agentBundle.agentByKey(spec.agentKey) : null;
    const createdAt = ctx.hoursAgo(spec.ageHours);
    const run = agent
      ? runs
          .filter((r) => r.agentId === agent.id && r.startedAt <= createdAt)
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null
      : null;

    const long = spec.direction === "LONG";
    const tick = ref.instrument.tickSize;
    const entry = roundToTick(ref.price, tick);
    const stopDistance = Math.max(tick * 4, ref.price * spec.expectedReturnPct * 0.8);
    const targetDistance = Math.max(tick * 6, ref.price * spec.expectedReturnPct);
    const suggestedNotional = round(portfolio.nav * spec.notionalPctNav, 2);
    const suggestedQuantity = spec.direction === "FLAT" ? 0 : quantityForNotional(ref, suggestedNotional);

    signals.push({
      id: ctx.ids.next(ID_PREFIX.signal),
      instrumentId: ref.instrument.id,
      symbol: ref.instrument.symbol,
      assetClass: ref.instrument.assetClass,
      portfolioId: portfolio.id,
      strategyId: strategy.id,
      agentId: agent ? agent.id : null,
      runId: run ? run.id : null,
      direction: spec.direction,
      side: SIDE_BY_DIRECTION[spec.direction],
      conviction: spec.conviction,
      expectedReturnPct: spec.expectedReturnPct,
      horizonHours: spec.horizonHours,
      suggestedNotional,
      suggestedQuantity,
      entryPrice: spec.direction === "FLAT" ? null : entry,
      stopPrice: spec.direction === "FLAT" ? null : roundToTick(long ? entry - stopDistance : entry + stopDistance, tick),
      targetPrice: spec.direction === "FLAT" ? null : roundToTick(long ? entry + targetDistance : entry - targetDistance, tick),
      thesis: spec.thesis,
      factors: spec.factors.map(([factor, weight, evidence]) => ({ factor, weight, evidence })),
      status: spec.status,
      createdAt,
      expiresAt: ctx.shift(createdAt, spec.horizonHours * 3_600_000),
    });
  }

  // Publish the signal ids back onto the runs that produced them.
  for (const run of runs) {
    const produced = signals.filter((s) => s.runId === run.id).map((s) => s.id);
    if (produced.length > 0) run.signalIds = produced;
  }

  return { signals };
}
