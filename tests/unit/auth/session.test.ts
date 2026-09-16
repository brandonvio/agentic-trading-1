import { describe, it, expect } from "vitest";
import { encodeSession, decodeSession, newSessionPayload, SESSION_TTL_MS, sessionCookieOptions } from "@/lib/auth/session";

describe("session tokens", () => {
  const now = Date.parse("2026-09-03T14:30:00.000Z");

  it("round-trips a signed payload", () => {
    const payload = newSessionPayload("usr_1", now);
    expect(payload.expiresAt - payload.issuedAt).toBe(SESSION_TTL_MS);
    const token = encodeSession(payload);
    expect(token.split(".")).toHaveLength(2);
    expect(decodeSession(token, now)).toEqual(payload);
  });

  it("rejects tampered, malformed, and expired tokens", () => {
    const token = encodeSession(newSessionPayload("usr_1", now));
    const [body, sig] = token.split(".");
    const otherBody = Buffer.from(JSON.stringify({ userId: "usr_2", issuedAt: now, expiresAt: now + 1000 })).toString("base64url");
    expect(decodeSession(`${otherBody}.${sig}`, now)).toBeNull();
    expect(decodeSession(`${body}.deadbeef`, now)).toBeNull();
    expect(decodeSession("garbage", now)).toBeNull();
    expect(decodeSession(undefined, now)).toBeNull();
    expect(decodeSession(token, now + SESSION_TTL_MS + 1)).toBeNull();
  });

  it("cookie options are httpOnly + lax with the right expiry", () => {
    const opts = sessionCookieOptions(now + 1000);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.expires.getTime()).toBe(now + 1000);
  });
});
