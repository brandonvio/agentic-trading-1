import "server-only";
import { cache } from "react";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import type { ApprovalRequest } from "@/lib/domain/approval";
import { page, principal } from "../../_lib/data";

/**
 * The queue is small enough to load once per request and partition in memory,
 * which keeps the tiles, the pending table and the decided history from ever
 * disagreeing with each other.
 */
export const loadApprovals = cache(() => safe(async () => services().approvals.list(await principal(), {}, page(500))));

export function isPending(a: ApprovalRequest): boolean {
  return a.status === "pending";
}

/** Oldest first: the queue is worked from the top. */
export function byOldest(a: ApprovalRequest, b: ApprovalRequest): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/** Most recently decided first. */
export function byDecidedDesc(a: ApprovalRequest, b: ApprovalRequest): number {
  return (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt);
}

/** First value of a search param (Next gives `string | string[] | undefined`). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "" ? undefined : v;
}

export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Deep link for an approval's subject, when the subject has a page. */
export function subjectHref(a: ApprovalRequest): string | null {
  if (a.type === "order") return `/orders/${a.subjectId}`;
  if (a.type === "strategy_deploy") return `/strategies/${a.subjectId}`;
  return null;
}