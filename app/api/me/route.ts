import { withAuth } from "@/lib/api/handler";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { services } from "@/lib/container";

/** The signed-in user's profile plus the resolved principal (roles, permissions, desk scope). */
export const GET = withAuth(null, async ({ req, principal }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const resolved = await services().auth.resolve(token);
  return resolved ? { ...resolved.user, principal: resolved.principal } : { principal };
});
