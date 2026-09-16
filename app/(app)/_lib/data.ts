import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import type { Principal } from "@/lib/domain/auth";
import type { PageQuery } from "@/lib/domain/common";
import type { Desk } from "@/lib/domain/org";
import type { Portfolio } from "@/lib/domain/portfolio";
import type { User } from "@/lib/domain/auth";

/**
 * Shared per-request loaders for the domain pages. Each is `cache()`d so
 * sibling Suspense sections can await the same call once, and each lookup map
 * degrades to an empty Map when the role cannot read that resource — labels
 * fall back to ids rather than the page failing.
 */
export async function principal(): Promise<Principal> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.principal;
}

export async function currentUser(): Promise<User> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.user;
}

/** PageQuery literal; services cap `limit` at 500. */
export const page = (limit = 50, offset = 0): PageQuery => ({ limit, offset });

/** Reference timestamp for relative times; stable for the whole request. */
export const loadNow = cache(async (): Promise<number> => Date.now());

export const loadPortfolioIndex = cache(async (): Promise<Map<string, Portfolio>> => {
  const r = await safe(async () => services().portfolios.list(await principal(), {}, page(500)));
  return new Map(r.ok ? r.value.items.map((p) => [p.id, p]) : []);
});

export const loadDeskIndex = cache(async (): Promise<Map<string, Desk>> => {
  const r = await safe(async () => services().desks.list(await principal(), page(200)));
  return new Map(r.ok ? r.value.items.map((d) => [d.id, d]) : []);
});

export const loadUserIndex = cache(async (): Promise<Map<string, User>> => {
  const r = await safe(async () => services().users.list(await principal(), {}, page(500)));
  return new Map(r.ok ? r.value.items.map((u) => [u.id, u]) : []);
});

/** "MACRO-1 · Global Macro Core" for a portfolio id, or the raw id when unknown. */
export function portfolioLabel(index: Map<string, Portfolio>, id: string | null | undefined): string {
  if (!id) return "—";
  const p = index.get(id);
  return p ? p.code : id;
}
