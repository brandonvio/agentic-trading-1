/** Minimal Black–Scholes pricer used to derive mock option quotes from the simulated underlying. */
import type { OptionRight } from "@/lib/domain/instrument";

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * erf);
}

export interface BlackScholesInput {
  spot: number;
  strike: number;
  /** Time to expiry in years. */
  years: number;
  /** Annualised implied volatility (0.25 = 25%). */
  vol: number;
  /** Continuously compounded risk-free rate. */
  rate: number;
  right: OptionRight;
}

/** European option price; returns intrinsic value when expired. */
export function blackScholes(input: BlackScholesInput): number {
  const { spot, strike, years, vol, rate, right } = input;
  const intrinsic = right === "CALL" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  if (years <= 0 || vol <= 0) return intrinsic;
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const discount = Math.exp(-rate * years);
  if (right === "CALL") return spot * normalCdf(d1) - strike * discount * normalCdf(d2);
  return strike * discount * normalCdf(-d2) - spot * normalCdf(-d1);
}
