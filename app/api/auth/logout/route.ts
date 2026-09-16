import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { services } from "@/lib/container";

export const POST = withAuth(null, async ({ principal }) => {
  await services().auth.logout(principal);
  const res = NextResponse.json({ data: { ok: true } });
  // Expire the cookie immediately (same attributes as when it was set).
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
});
