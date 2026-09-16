import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ap_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h trading day

export interface SessionPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-only-secret-change-me";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

/** Stateless, HMAC-signed session token: base64url(json).signature */
export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.userId !== "string" || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newSessionPayload(userId: string, now = Date.now()): SessionPayload {
  return { userId, issuedAt: now, expiresAt: now + SESSION_TTL_MS };
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}
