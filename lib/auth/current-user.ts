import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { cache } from "react";
import type { Principal, User } from "@/lib/domain/auth";
import { SESSION_COOKIE } from "./session";
import { getContainer } from "@/lib/container";
import { TOKENS } from "@/lib/core/tokens";

async function resolveToken(token: string | undefined | null): Promise<{ user: User; principal: Principal } | null> {
  if (!token) return null;
  const auth = getContainer().resolve(TOKENS.authService);
  return auth.resolve(token);
}

/** For route handlers: read the session cookie from the incoming request. */
export async function getPrincipalFromRequest(req: NextRequest): Promise<Principal | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const resolved = await resolveToken(token);
  return resolved?.principal ?? null;
}

/** For server components / server actions: read the session via next/headers. Memoised per request. */
export const getCurrentSession = cache(async (): Promise<{ user: User; principal: Principal } | null> => {
  const store = await cookies();
  return resolveToken(store.get(SESSION_COOKIE)?.value);
});

export async function getCurrentPrincipal(): Promise<Principal | null> {
  return (await getCurrentSession())?.principal ?? null;
}
