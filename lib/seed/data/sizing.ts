/**
 * Shared sizing / notional helpers used by the position, order and signal
 * generators so quantities, notionals and market values stay consistent.
 */
import type { AssetClass, Instrument } from "@/lib/domain/instrument";
import type { InstrumentRef } from "../context";
import { round } from "../context";
import { FX_TO_USD } from "./instruments";

/** USD value of one unit of the instrument (price x multiplier x fx). */
export function unitValueUsd(instrument: Instrument, price: number): number {
  return price * instrument.multiplier * FX_TO_USD[instrument.currency];
}

/** USD notional of `quantity` units (sign preserved). */
export function notionalUsd(instrument: Instrument, price: number, quantity: number): number {
  return round(quantity * unitValueUsd(instrument, price), 2);
}

/** Decimal places a quantity of this asset class is expressed in. */
function quantityDecimals(assetClass: AssetClass): number {
  return assetClass === "crypto" ? 4 : 0;
}

/**
 * Round a raw quantity to something a broker would accept: whole contracts or
 * shares, 1,000-unit FX clips, four crypto decimals. Never returns zero for a
 * positive target — the smallest tradable clip is used instead.
 */
export function roundQuantity(instrument: Instrument, raw: number): number {
  const magnitude = Math.abs(raw);
  if (instrument.assetClass === "forex") {
    const clips = Math.max(1, Math.round(magnitude / 1_000));
    return clips * 1_000;
  }
  const dp = quantityDecimals(instrument.assetClass);
  const step = 10 ** -dp;
  const rounded = round(Math.max(step, Math.round(magnitude / step) * step), dp);
  return rounded;
}

/** Quantity whose USD notional is closest to `targetUsd`. */
export function quantityForNotional(ref: InstrumentRef, targetUsd: number): number {
  const unit = unitValueUsd(ref.instrument, ref.price);
  return roundQuantity(ref.instrument, targetUsd / unit);
}

/** Per-share/contract commission a broker would charge, in USD. */
export function commissionFor(instrument: Instrument, quantity: number, price: number): number {
  switch (instrument.broker) {
    case "ibkr":
      return instrument.assetClass === "option"
        ? round(Math.max(1, quantity * 0.65), 2)
        : round(Math.max(1, quantity * 0.005), 2);
    case "tradovate":
      return round(quantity * 2.25, 2);
    case "oanda":
      return round(Math.abs(quantity) * price * FX_TO_USD[instrument.currency] * 0.00002, 2);
    case "coinbase":
      return round(Math.abs(quantity) * price * 0.0006, 2);
    case "kalshi":
      return round(Math.min(Math.abs(quantity) * 0.035, Math.abs(quantity) * price * 0.07), 2);
    default:
      return 0;
  }
}
