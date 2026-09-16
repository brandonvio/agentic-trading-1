/**
 * `safe(promise)` turns a rejection into a value so dashboard sections can
 * degrade independently (e.g. an analyst without `risk:read` still sees the
 * rest of the page). Never swallows redirects: Next's redirect/notFound throw
 * special errors that must propagate.
 */
import { isAppError, toAppError, type AppError } from "@/lib/core/errors";

export type SafeResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR"));
}

export async function safe<T>(promise: Promise<T> | (() => Promise<T>)): Promise<SafeResult<T>> {
  try {
    const value = await (typeof promise === "function" ? promise() : promise);
    return { ok: true, value };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: isAppError(e) ? e : toAppError(e) };
  }
}

export function isForbidden(r: SafeResult<unknown>): boolean {
  return !r.ok && (r.error.code === "FORBIDDEN" || r.error.code === "UNAUTHORIZED");
}
