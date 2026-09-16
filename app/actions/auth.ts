"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/auth/current-user";
import { services } from "@/lib/container";
import { isAppError } from "@/lib/core/errors";

/** State shape consumed by `useActionState` on the login screen. */
export interface LoginState {
  error: string | null;
  /** Echoed back so the fallback form can keep what was typed. */
  email: string;
}

// NOTE: a "use server" module may only export async functions, so the initial
// state literal lives with the form component that seeds `useActionState`.

/** Only allow same-origin, absolute-path redirects (`//evil.com` is not one). */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function loginErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "UNAUTHORIZED") return "No active user matches that email address.";
    return error.message;
  }
  return "Sign-in is unavailable right now. Please try again.";
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * Mock sign-in: resolves the user by email, sets the signed session cookie and
 * lands on `next` (defaults to /dashboard). `redirect()` throws, so it is
 * deliberately called outside the try/catch.
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));

  if (!email) return { error: "Enter an email address to sign in.", email: "" };

  try {
    const { token, expiresAt } = await services().auth.login(email, await clientIp());
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  } catch (error) {
    return { error: loginErrorMessage(error), email };
  }

  redirect(next);
}

/** Clears the session cookie (audit-logging the logout when a session exists). */
export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    try {
      await services().auth.logout(session.principal);
    } catch {
      // Audit failures must not trap the user in a session they asked to end.
    }
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
