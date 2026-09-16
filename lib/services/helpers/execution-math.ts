/**
 * Pure arithmetic for applying broker fills to positions, orders and cash.
 *
 * Conventions
 *  - `Position.quantity` is signed: positive long, negative short.
 *  - `marketValue` and `unrealizedPnl` already include the contract multiplier.
 *  - Realised PnL is booked only on the quantity that reduces an existing
 *    position; the remainder (if a fill crosses through zero) opens a new
 *    position at the fill price.
 *  - Cash moves by `-signedQuantity * price * multiplier - commission`, so a
 *    buy debits cash and a sell credits it, and commission always debits.
 */
import type { Fill, Order } from "@/lib/domain/order";
import type { Position } from "@/lib/domain/portfolio";
import type { Side } from "@/lib/domain/common";

/** +1 for BUY, -1 for SELL. */
export function sideSign(side: Side): number {
  return side === "BUY" ? 1 : -1;
}

/** Notional value of a quantity at a price, including the contract multiplier. */
export function notionalOf(quantity: number, price: number, multiplier: number): number {
  return Math.abs(quantity) * price * multiplier;
}

export interface FillEffect {
  /** Signed change in cash for the portfolio. */
  cashDelta: number;
  /** Realised PnL booked by this fill (0 when it only opens/increases a position). */
  realizedPnl: number;
}

export interface PositionUpdate {
  quantity: number;
  averagePrice: number;
  markPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  closedAt: string | null;
}

/**
 * Apply a fill to an existing position (or to a flat book when `position` is
 * null) and return the resulting position figures plus the cash/PnL effect.
 */
export function applyFill(
  position: Pick<Position, "quantity" | "averagePrice" | "realizedPnl"> | null,
  fill: Pick<Fill, "side" | "quantity" | "price" | "commission">,
  multiplier: number,
  at: string,
): { update: PositionUpdate; effect: FillEffect } {
  const signed = sideSign(fill.side) * fill.quantity;
  const priorQty = position?.quantity ?? 0;
  const priorAvg = position?.averagePrice ?? 0;
  const priorRealized = position?.realizedPnl ?? 0;

  let realized = 0;
  const newQty = priorQty + signed;
  let newAvg = priorAvg;

  const isReducing = priorQty !== 0 && Math.sign(signed) !== Math.sign(priorQty);
  if (isReducing) {
    // Book PnL on the overlapping quantity only.
    const closedQty = Math.min(Math.abs(signed), Math.abs(priorQty));
    // Long: profit when sold above average. Short: profit when bought below.
    realized = (fill.price - priorAvg) * closedQty * multiplier * Math.sign(priorQty);
    if (Math.abs(signed) > Math.abs(priorQty)) {
      // Crossed through zero: the remainder opens a fresh position at the fill price.
      newAvg = fill.price;
    }
    // Reducing without crossing keeps the original average price.
  } else if (priorQty === 0) {
    newAvg = fill.price;
  } else {
    // Increasing an existing position: weighted-average the entry price.
    const totalCost = Math.abs(priorQty) * priorAvg + Math.abs(signed) * fill.price;
    newAvg = totalCost / (Math.abs(priorQty) + Math.abs(signed));
  }

  if (newQty === 0) newAvg = 0;

  return {
    update: {
      quantity: newQty,
      averagePrice: newAvg,
      markPrice: fill.price,
      marketValue: newQty * fill.price * multiplier,
      unrealizedPnl: newQty === 0 ? 0 : (fill.price - newAvg) * newQty * multiplier,
      realizedPnl: priorRealized + realized,
      closedAt: newQty === 0 ? at : null,
    },
    effect: {
      cashDelta: -signed * fill.price * multiplier - fill.commission,
      realizedPnl: realized,
    },
  };
}

/** Volume-weighted average price across fills, or null when there are none. */
export function averageFillPrice(fills: ReadonlyArray<Pick<Fill, "quantity" | "price">>): number | null {
  const qty = fills.reduce((s, f) => s + f.quantity, 0);
  if (qty === 0) return null;
  return fills.reduce((s, f) => s + f.price * f.quantity, 0) / qty;
}

/**
 * Order status implied by fill progress. Used after applying broker fills so
 * the order row always agrees with its fills.
 */
export function statusForFillProgress(filled: number, ordered: number, acknowledged: Order["status"]): Order["status"] {
  if (filled <= 0) return acknowledged;
  if (filled >= ordered - 1e-9) return "FILLED";
  return "PARTIALLY_FILLED";
}
