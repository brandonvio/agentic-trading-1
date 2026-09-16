import { NextResponse } from "next/server";
import { withPublic } from "@/lib/api/handler";
import { LoginBody } from "@/lib/api/schemas";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { services } from "@/lib/container";

export const POST = withPublic(
  async ({ req, body }) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const { user, token, expiresAt } = await services().auth.login(body.email, ip);
    const res = NextResponse.json({ data: { user, expiresAt } });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  },
  { body: LoginBody },
);
