/** Small numeric helpers shared by the simulator and adapters (tick math). */

/** Number of decimal places needed to represent `step` (e.g. 0.25 → 2, 1/64 → 6, 1e-5 → 5). */
export function decimalsOf(step: number): number {
  const s = step.toString();
  const [mantissa, exponent] = s.split("e-");
  const mantissaDecimals = mantissa.includes(".") ? mantissa.split(".")[1].length : 0;
  return exponent === undefined ? mantissaDecimals : mantissaDecimals + Number(exponent);
}

/** Rounds to the nearest multiple of `tick` and strips float noise. */
export function roundToTick(price: number, tick: number): number {
  if (tick <= 0) return price;
  return Number((Math.round(price / tick) * tick).toFixed(decimalsOf(tick)));
}

/** Rounds down to a multiple of `step`. */
export function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Number((Math.floor(value / step + 1e-9) * step).toFixed(decimalsOf(step)));
}

/** True when `value` is (within float tolerance) an integer multiple of `step`. */
export function isMultipleOf(value: number, step: number): boolean {
  if (step <= 0) return true;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

/** Clamps `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds a money amount to cents. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
