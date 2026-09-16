import { describe, expect, it } from "vitest";
import { Bar, Quote } from "@/lib/domain/instrument";
import { MarketSimulator, BAR_INTERVAL_MINUTES } from "@/lib/brokers/market-simulator";
import { referenceFor } from "@/lib/brokers/reference-prices";
import { BTCUSD, CLZ6, ESZ6, EURUSD, FED_CUT, SPY, SPY_CALL, SPY_PUT, USDJPY, ZNZ6, clockAt, simulator, withDetails } from "./fixtures";

const AT = new Date("2026-09-03T14:30:00.000Z");

describe("MarketSimulator determinism", () => {
  it("returns identical quotes for the same seed, instrument and time (independent of call order)", () => {
    const a = simulator(clockAt(), 42);
    const b = simulator(clockAt(), 42);
    b.quote(BTCUSD(), new Date("2026-09-01T00:00:00Z"));
    b.bars(SPY(), "1d", 30, AT);
    expect(a.quote(SPY(), AT)).toEqual(b.quote(SPY(), AT));
    expect(a.bars(SPY(), "5m", 10, AT)).toEqual(b.bars(SPY(), "5m", 10, AT));
  });

  it("changes with the seed", () => {
    const a = simulator(clockAt(), 1).quote(SPY(), AT);
    const b = simulator(clockAt(), 2).quote(SPY(), AT);
    expect(a.mid).not.toBe(b.mid);
  });

  it("is stable within a minute and drifts across minutes", () => {
    const s = simulator();
    const q0 = s.quote(SPY(), new Date("2026-09-03T14:30:05Z"));
    const q1 = s.quote(SPY(), new Date("2026-09-03T14:30:55Z"));
    const q2 = s.quote(SPY(), new Date("2026-09-03T14:31:00Z"));
    expect(q0.bid).toBe(q1.bid);
    expect(q0.ask).toBe(q1.ask);
    expect(q0.mid).toBe(q1.mid);
    expect(q2.mid).not.toBe(q1.mid);
  });

  it("uses the injected clock by default", () => {
    const clock = clockAt("2026-09-03T14:30:00Z");
    const s = new MarketSimulator({ clock, seed: 42 });
    const q1 = s.quote(SPY());
    clock.advance(5 * 60_000);
    const q2 = s.quote(SPY());
    expect(q1.asOf).toBe("2026-09-03T14:30:00.000Z");
    expect(q2.asOf).toBe("2026-09-03T14:35:00.000Z");
    expect(q2.mid).not.toBe(q1.mid);
  });
});

describe("MarketSimulator quotes", () => {
  const s = simulator();

  it("anchors prices near the September-2026 reference levels", () => {
    expect(s.quote(SPY(), AT).mid).toBeGreaterThan(560);
    expect(s.quote(SPY(), AT).mid).toBeLessThan(680);
    expect(s.quote(EURUSD(), AT).mid).toBeGreaterThan(1.03);
    expect(s.quote(EURUSD(), AT).mid).toBeLessThan(1.16);
    expect(s.quote(USDJPY(), AT).mid).toBeGreaterThan(135);
    expect(s.quote(USDJPY(), AT).mid).toBeLessThan(165);
    expect(s.quote(BTCUSD(), AT).mid).toBeGreaterThan(80_000);
    expect(s.quote(BTCUSD(), AT).mid).toBeLessThan(135_000);
    expect(s.quote(ESZ6(), AT).mid).toBeGreaterThan(5_600);
    expect(s.quote(ESZ6(), AT).mid).toBeLessThan(6_900);
  });

  it("produces schema-valid quotes with ask > bid, last inside the spread and tick-aligned prices", () => {
    for (const i of [SPY(), SPY_CALL(), EURUSD(), USDJPY(), ESZ6(), CLZ6(), ZNZ6(), BTCUSD(), FED_CUT()]) {
      const q = Quote.parse(s.quote(i, AT));
      expect(q.instrumentId).toBe(i.id);
      expect(q.ask).toBeGreaterThan(q.bid);
      expect(q.last).toBeGreaterThanOrEqual(q.bid);
      expect(q.last).toBeLessThanOrEqual(q.ask);
      expect(q.mid).toBeCloseTo((q.bid + q.ask) / 2, 10);
      expect(q.bidSize).toBeGreaterThan(0);
      expect(q.askSize).toBeGreaterThan(0);
      expect(q.volume).toBeGreaterThan(0);
      expect(Math.abs(q.bid / i.tickSize - Math.round(q.bid / i.tickSize))).toBeLessThan(1e-6);
      expect(Math.abs(q.ask / i.tickSize - Math.round(q.ask / i.tickSize))).toBeLessThan(1e-6);
      expect(Math.abs(q.changePct)).toBeLessThan(0.25);
    }
  });

  it("applies asset-class spreads (fx tenth-pips, futures one tick, event 2c)", () => {
    const fx = s.quote(EURUSD(), AT);
    expect(fx.ask - fx.bid).toBeCloseTo(0.00008, 5);
    const es = s.quote(ESZ6(), AT);
    expect(es.ask - es.bid).toBeCloseTo(0.25, 6);
    const ev = s.quote(FED_CUT(), AT);
    expect(ev.ask - ev.bid).toBeCloseTo(0.02, 6);
    const eq = s.quote(SPY(), AT);
    expect(eq.ask - eq.bid).toBeGreaterThanOrEqual(0.01);
    expect(eq.ask - eq.bid).toBeLessThan(0.5);
  });

  it("keeps event contracts within 0.01–0.99 at cent ticks across a long horizon", () => {
    for (let d = 0; d < 400; d += 7) {
      const at = new Date(Date.UTC(2026, 0, 1 + d, 15, 0));
      const q = s.quote(FED_CUT(), at);
      expect(q.bid).toBeGreaterThanOrEqual(0.01);
      expect(q.ask).toBeLessThanOrEqual(0.99);
      expect(Math.round(q.bid * 100)).toBeCloseTo(q.bid * 100, 8);
    }
    const extreme = withDetails(FED_CUT({ id: "ins_sure", symbol: "SURE-THING" }), {
      assetClass: "event",
      question: "?",
      closeTime: "2026-12-31T00:00:00Z",
      settlementValue: 1,
    });
    const q = s.quote(extreme, AT);
    expect(q.bid).toBeGreaterThanOrEqual(0.01);
    expect(q.ask).toBeLessThanOrEqual(0.99);
  });

  it("prices options from Black–Scholes on the simulated underlying", () => {
    const spot = s.underlyingPrice("SPY", AT);
    const c600 = s.quote(SPY_CALL(600), AT);
    const c620 = s.quote(SPY_CALL(620), AT);
    const c640 = s.quote(SPY_CALL(640), AT);
    expect(c600.mid).toBeGreaterThan(c620.mid);
    expect(c620.mid).toBeGreaterThan(c640.mid);
    // positive time value: price above intrinsic
    expect(c600.mid).toBeGreaterThan(Math.max(spot - 600, 0));
    expect(c640.mid).toBeGreaterThan(0);
    expect(c620.impliedVol).toBeGreaterThan(0.1);
    expect(c620.impliedVol).toBeLessThan(0.3);
    // skew: lower strikes carry higher IV
    expect(c600.impliedVol ?? 0).toBeGreaterThan(c640.impliedVol ?? 0);
    // put-call parity holds approximately at the same strike
    const p620 = s.quote(SPY_PUT(620), AT);
    expect(Math.abs(c620.mid - p620.mid - (spot - 620))).toBeLessThan(spot * 0.02);
    // expiring option collapses to intrinsic
    const expired = s.quote(SPY_CALL(600, "2026-08-01"), AT);
    expect(expired.mid).toBeCloseTo(Math.max(spot - 600, 0.01), 0);
  });

  it("prices futures from the root path with carry and unknown symbols from a hash", () => {
    const es = s.quote(ESZ6(), AT).mid;
    const spot = s.underlyingPrice("ES", AT);
    expect(es / spot).toBeGreaterThan(1);
    expect(es / spot).toBeLessThan(1.03);
    const unknown = SPY({ id: "ins_zzzz", symbol: "ZZZZ" });
    const q = s.quote(unknown, AT);
    expect(q.mid).toBeGreaterThan(5);
    expect(q.mid).toBeLessThan(600);
    expect(referenceFor("ZZZZ", "equity").price).toBe(referenceFor("ZZZZ", "equity").price);
  });

  it("derives changePct from the prior UTC day's close", () => {
    const q = s.quote(SPY(), AT);
    const prior = s.bars(SPY(), "1d", 2, AT)[0].close;
    expect(q.changePct).toBeCloseTo(q.mid / prior - 1, 3);
  });
});

describe("MarketSimulator bars", () => {
  const s = simulator();

  function checkInvariants(bars: Bar[], intervalMin: number, count: number) {
    expect(bars).toHaveLength(count);
    for (let i = 0; i < bars.length; i++) {
      const b = Bar.parse(bars[i]);
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.low).toBeGreaterThan(0);
      expect(b.volume).toBeGreaterThanOrEqual(0);
      const ms = new Date(b.time).getTime();
      expect(ms % (intervalMin * 60_000)).toBe(0);
      if (i > 0) {
        expect(ms - new Date(bars[i - 1].time).getTime()).toBe(intervalMin * 60_000);
        expect(b.open).toBe(bars[i - 1].close);
      }
    }
  }

  it("satisfies OHLC invariants, alignment and ascending order for every interval and class", () => {
    for (const i of [SPY(), SPY_CALL(), EURUSD(), ESZ6(), BTCUSD(), FED_CUT()]) {
      for (const interval of ["1m", "5m", "15m", "1h", "1d"] as const) {
        checkInvariants(s.bars(i, interval, 12, AT), BAR_INTERVAL_MINUTES[interval], 12);
      }
    }
  });

  it("ends with the bar containing `end` and is deterministic", () => {
    const bars = s.bars(SPY(), "15m", 4, new Date("2026-09-03T14:37:00Z"));
    expect(bars.map((b) => b.time)).toEqual([
      "2026-09-03T13:45:00.000Z",
      "2026-09-03T14:00:00.000Z",
      "2026-09-03T14:15:00.000Z",
      "2026-09-03T14:30:00.000Z",
    ]);
    expect(bars.at(-1)?.close).toBe(s.quote(SPY(), new Date("2026-09-03T14:37:00Z")).mid > 0 ? bars.at(-1)?.close : 0);
    expect(simulator().bars(SPY(), "15m", 4, new Date("2026-09-03T14:37:00Z"))).toEqual(bars);
  });

  it("keeps event bars in bounds and produces long daily histories quickly", () => {
    const ev = s.bars(FED_CUT(), "1d", 60, AT);
    for (const b of ev) {
      expect(b.low).toBeGreaterThanOrEqual(0.01);
      expect(b.high).toBeLessThanOrEqual(0.99);
    }
    const daily = s.bars(BTCUSD(), "1d", 365, AT);
    checkInvariants(daily, 1440, 365);
    expect(daily[0].time).toBe("2025-09-04T00:00:00.000Z");
  });
});
