import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, unwrap, mapResult } from "@/lib/core/result";
import {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  RiskRejectedError,
  toAppError,
  isAppError,
} from "@/lib/core/errors";
import { SequentialIdGenerator, newId, RandomIdGenerator } from "@/lib/core/ids";
import { FixedClock, SystemClock } from "@/lib/core/clock";

describe("Result", () => {
  it("wraps values and errors", () => {
    const a = ok(1);
    const b = err("boom");
    expect(isOk(a) && a.value).toBe(1);
    expect(isErr(b) && b.error).toBe("boom");
    expect(unwrap(a)).toBe(1);
    expect(() => unwrap(err(new Error("x")))).toThrow("x");
    expect(mapResult(a, (v) => v + 1)).toEqual(ok(2));
    expect(mapResult(b, (v: number) => v + 1)).toEqual(b);
  });
});

describe("errors", () => {
  it("carries code/status and serialises to the API envelope", () => {
    const e = new NotFoundError("Order", "ord_1");
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.toJSON()).toEqual({ error: { code: "NOT_FOUND", message: "Order 'ord_1' not found", details: { entity: "Order", id: "ord_1" } } });
    expect(new ValidationError().status).toBe(400);
    expect(new ForbiddenError().status).toBe(403);
    expect(new RiskRejectedError("too big").status).toBe(422);
    expect(isAppError(e)).toBe(true);
    expect(e.name).toBe("NotFoundError");
  });

  it("recognises an AppError constructed by another module instance", () => {
    // Simulates Next.js evaluating lib/core/errors.ts in a second bundle: the
    // object is not `instanceof` our AppError but must still map to 403.
    class ForeignAppError extends Error {
      readonly __isAgenticPropAppError = true as const;
      readonly code = "FORBIDDEN";
      readonly status = 403;
      readonly details = null;
    }
    const foreign = new ForeignAppError("cross-bundle");
    expect(foreign).not.toBeInstanceOf(AppError);
    expect(isAppError(foreign)).toBe(true);
    expect(toAppError(foreign).status).toBe(403);
  });

  it("does not mistake an ordinary error or plain object for an AppError", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError({ code: "FORBIDDEN", status: 403 })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError("FORBIDDEN")).toBe(false);
  });

  it("converts unknown errors into 500 AppErrors", () => {
    const e = toAppError(new Error("db down"));
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(500);
    expect(e.message).toBe("db down");
    expect(toAppError("str").message).toBe("str");
    expect(toAppError(e)).toBe(e);
  });
});

describe("ids", () => {
  it("generates prefixed, unique random ids", () => {
    const a = newId("ord");
    const b = newId("ord");
    expect(a).toMatch(/^ord_[0-9a-z]{12}$/);
    expect(a).not.toBe(b);
    expect(new RandomIdGenerator().next("pf")).toMatch(/^pf_/);
  });

  it("sequential generator is deterministic per prefix", () => {
    const g = new SequentialIdGenerator("t");
    expect(g.next("usr")).toBe("usr_t0001");
    expect(g.next("usr")).toBe("usr_t0002");
    expect(g.next("pf")).toBe("pf_t0001");
  });
});

describe("clock", () => {
  it("fixed clock is stable and advanceable", () => {
    const c = new FixedClock("2026-09-03T14:30:00.000Z");
    expect(c.nowIso()).toBe("2026-09-03T14:30:00.000Z");
    c.advance(60_000);
    expect(c.nowIso()).toBe("2026-09-03T14:31:00.000Z");
    c.set("2026-01-01T00:00:00.000Z");
    expect(c.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("system clock returns current time", () => {
    const before = Date.now();
    const t = new SystemClock().now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
  });
});
