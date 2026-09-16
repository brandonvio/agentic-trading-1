// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatPct,
  formatQty,
  formatRelative,
  formatSymbol,
  humanize,
  initials,
  signOf,
} from "@/lib/ui/format";

describe("formatMoney", () => {
  it("groups thousands and fixes decimals", () => {
    expect(formatMoney(12340.5)).toBe("$12,340.50");
  });

  it("compacts large magnitudes", () => {
    expect(formatMoney(1_240_000_000, "USD", { compact: true })).toBe("$1.24B");
    expect(formatMoney(-2_500_000, "USD", { compact: true })).toBe("-$2.5M");
  });

  it("honours zero-decimal currencies and forced signs", () => {
    expect(formatMoney(1250, "JPY")).toBe("¥1,250");
    expect(formatMoney(1250, "USD", { sign: true })).toBe("+$1,250.00");
  });

  it("renders an em dash for missing or non-finite values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });
});

describe("formatPct / formatNumber / formatQty / formatMultiple", () => {
  it("treats the input as a fraction", () => {
    expect(formatPct(0.0124, { sign: true })).toBe("+1.24%");
    expect(formatPct(-0.5)).toBe("-50.00%");
  });

  it("formats counts and compact numbers", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(1234, { compact: true })).toBe("1.23K");
    expect(formatNumber(null)).toBe("—");
  });

  it("keeps fractional quantities readable", () => {
    expect(formatQty(12)).toBe("12");
    expect(formatQty(0.12345)).toBe("0.1235");
    expect(formatQty(1.5)).toBe("1.5");
  });

  it("suffixes multiples with x", () => {
    expect(formatMultiple(2.3)).toBe("2.30x");
    expect(formatMultiple(null)).toBe("—");
  });
});

describe("date helpers", () => {
  it("formats UTC deterministically", () => {
    expect(formatDateTime("2026-09-03T14:32:10.000Z")).toBe("2026-09-03 14:32");
    expect(formatDateTime("2026-09-03T14:32:10.000Z", { style: "time", seconds: true })).toBe("14:32:10");
  });

  it("formats a relative time against an explicit now", () => {
    const now = Date.parse("2026-09-03T14:32:00.000Z");
    expect(formatRelative("2026-09-03T14:29:00.000Z", now)).toBe("3m ago");
    expect(formatRelative("2026-09-03T16:32:00.000Z", now)).toBe("in 2h");
    expect(formatRelative(null, now)).toBe("—");
  });
});

describe("text helpers", () => {
  it("humanises enum values", () => {
    expect(humanize("risk_on")).toBe("Risk on");
    expect(humanize("PENDING_APPROVAL")).toBe("Pending approval");
  });

  it("builds avatar initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials(null)).toBe("?");
  });

  it("upper-cases plain tickers only", () => {
    expect(formatSymbol(" btc-usd ")).toBe("BTC-USD");
    expect(formatSymbol("Fed Dec 26 cut?")).toBe("Fed Dec 26 cut?");
  });

  it("reports the sign used for colouring", () => {
    expect(signOf(2)).toBe("pos");
    expect(signOf(-2)).toBe("neg");
    expect(signOf(0)).toBe("zero");
    expect(signOf(null)).toBe("zero");
  });
});
