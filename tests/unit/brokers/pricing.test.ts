import { describe, expect, it } from "vitest";
import { blackScholes, normalCdf } from "@/lib/brokers/black-scholes";
import { decimalsOf, floorToStep, isMultipleOf, roundToTick } from "@/lib/brokers/pricing";
import { easternTime, isEquityRth, isFuturesSessionOpen, isFxSessionOpen } from "@/lib/brokers/sessions";

describe("pricing helpers", () => {
  it("decimalsOf handles decimals, fractions and exponents", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.25)).toBe(2);
    expect(decimalsOf(0.00001)).toBe(5);
    expect(decimalsOf(1 / 64)).toBe(6);
    expect(decimalsOf(5e-7)).toBe(7);
  });

  it("roundToTick snaps prices without float noise", () => {
    expect(roundToTick(6250.13, 0.25)).toBe(6250.25);
    expect(roundToTick(6250.12, 0.25)).toBe(6250);
    expect(roundToTick(1.0923456, 0.00001)).toBe(1.09235);
    expect(roundToTick(111.5234, 1 / 64)).toBe(111.515625);
    expect(roundToTick(0.1 + 0.2, 0.01)).toBe(0.3);
  });

  it("isMultipleOf tolerates float error; floorToStep rounds down", () => {
    expect(isMultipleOf(0.3, 0.1)).toBe(true);
    expect(isMultipleOf(100, 1)).toBe(true);
    expect(isMultipleOf(0.00015, 0.00001)).toBe(true);
    expect(isMultipleOf(0.5, 1)).toBe(false);
    expect(floorToStep(87.9, 1)).toBe(87);
    expect(floorToStep(0.123456, 0.00001)).toBe(0.12345);
  });
});

describe("blackScholes", () => {
  it("normalCdf is symmetric and bounded", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("matches a textbook ATM call value and put-call parity", () => {
    const base = { spot: 100, strike: 100, years: 1, vol: 0.2, rate: 0.05 };
    const call = blackScholes({ ...base, right: "CALL" });
    const put = blackScholes({ ...base, right: "PUT" });
    expect(call).toBeCloseTo(10.4506, 3);
    expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.05), 4);
  });

  it("returns intrinsic value at expiry", () => {
    expect(blackScholes({ spot: 110, strike: 100, years: 0, vol: 0.2, rate: 0.05, right: "CALL" })).toBe(10);
    expect(blackScholes({ spot: 110, strike: 100, years: 0, vol: 0.2, rate: 0.05, right: "PUT" })).toBe(0);
  });
});

describe("sessions (ET)", () => {
  it("converts UTC to Eastern wall-clock with DST", () => {
    expect(easternTime(new Date("2026-09-03T14:30:00Z"))).toMatchObject({ weekday: 4, hour: 10, minute: 30 });
    expect(easternTime(new Date("2026-01-15T14:30:00Z"))).toMatchObject({ weekday: 4, hour: 9, minute: 30 });
  });

  it("flags equity RTH, FX weekend and futures halt", () => {
    expect(isEquityRth(new Date("2026-09-03T14:30:00Z"))).toBe(true);
    expect(isEquityRth(new Date("2026-09-03T21:00:00Z"))).toBe(false);
    expect(isEquityRth(new Date("2026-09-05T15:00:00Z"))).toBe(false); // Saturday
    expect(isFxSessionOpen(new Date("2026-09-05T15:00:00Z"))).toBe(false);
    expect(isFxSessionOpen(new Date("2026-09-06T22:00:00Z"))).toBe(true); // Sunday 18:00 ET
    expect(isFuturesSessionOpen(new Date("2026-09-03T21:30:00Z"))).toBe(false); // 17:30 ET halt
    expect(isFuturesSessionOpen(new Date("2026-09-03T22:30:00Z"))).toBe(true);
  });
});
