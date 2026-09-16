/**
 * Route-handler helpers.
 *
 *   export const GET = withAuth("orders:read", async ({ principal, query }) => {
 *     return services().orders.list(principal, filter, page);
 *   });
 *
 * - Resolves the session cookie into a Principal (401 if missing/invalid).
 * - Enforces a required permission (403).
 * - Parses query/body with zod schemas when supplied (400 with details).
 * - Maps AppError → JSON error envelope with the right status.
 * - Any non-AppError becomes a 500 with a generic message (logged).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { ValidationError, UnauthorizedError, ForbiddenError, toAppError } from "@/lib/core/errors";
import type { Permission, Principal } from "@/lib/domain/auth";
import { PageQuery } from "@/lib/domain/common";
import { hasPermission } from "@/lib/auth/permissions";
import { getPrincipalFromRequest } from "@/lib/auth/current-user";
import { getContainer } from "@/lib/container";
import { TOKENS } from "@/lib/core/tokens";

export interface HandlerContext<Q = Record<string, string>, B = unknown, P = Record<string, string>> {
  req: NextRequest;
  principal: Principal;
  query: Q;
  body: B;
  params: P;
  page: PageQuery;
}

export interface HandlerOptions<Q, B> {
  query?: ZodType<Q>;
  body?: ZodType<B>;
}

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

export function jsonError(e: unknown): NextResponse {
  const err = toAppError(e);
  if (err.status >= 500) {
    getContainer().resolve(TOKENS.logger).error("Unhandled route error", { message: err.message, stack: (e as Error)?.stack });
  }
  const body = err.status >= 500 ? { error: { code: err.code, message: "Internal server error", details: null } } : err.toJSON();
  return NextResponse.json(body, { status: err.status });
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

function parseQuery(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function parseBody(req: NextRequest): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const text = await req.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Body must be valid JSON");
  }
}

function validate<T>(schema: ZodType<T> | undefined, value: unknown, label: string): T {
  if (!schema) return value as T;
  const r = schema.safeParse(value ?? {});
  if (!r.success) throw new ValidationError(`Invalid ${label}`, r.error.flatten());
  return r.data;
}

/**
 * Wrap a route handler with authentication + authorization + validation.
 * `permission` may be a single permission, an array (any-of), or null for authenticated-only.
 */
export function withAuth<Q = Record<string, string>, B = unknown>(
  permission: Permission | Permission[] | null,
  handler: (ctx: HandlerContext<Q, B>) => Promise<unknown>,
  options: HandlerOptions<Q, B> = {},
) {
  return async (req: NextRequest, routeCtx?: RouteCtx): Promise<NextResponse> => {
    try {
      const principal = await getPrincipalFromRequest(req);
      if (!principal) throw new UnauthorizedError();
      if (permission) {
        const required = Array.isArray(permission) ? permission : [permission];
        if (!required.some((p) => hasPermission(principal, p))) {
          throw new ForbiddenError(`Requires one of: ${required.join(", ")}`, { required });
        }
      }
      const rawQuery = parseQuery(req);
      const page = validate(PageQuery, rawQuery, "paging");
      const query = validate(options.query, rawQuery, "query");
      const body = validate(options.body, await parseBody(req), "body");
      // Static routes are invoked with a context whose `params` is undefined.
      const rawParams = (routeCtx ? await routeCtx.params : undefined) ?? {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v.join("/") : v;

      const result = await handler({ req, principal, query, body, params, page });
      if (result instanceof NextResponse || result instanceof Response) return result as NextResponse;
      return ok(result);
    } catch (e) {
      return jsonError(e);
    }
  };
}

/** For unauthenticated endpoints (login, health). */
export function withPublic<Q = Record<string, string>, B = unknown>(
  handler: (ctx: Omit<HandlerContext<Q, B>, "principal"> & { principal: Principal | null }) => Promise<unknown>,
  options: HandlerOptions<Q, B> = {},
) {
  return async (req: NextRequest, routeCtx?: RouteCtx): Promise<NextResponse> => {
    try {
      const principal = await getPrincipalFromRequest(req);
      const rawQuery = parseQuery(req);
      const page = validate(PageQuery, rawQuery, "paging");
      const query = validate(options.query, rawQuery, "query");
      const body = validate(options.body, await parseBody(req), "body");
      // Static routes are invoked with a context whose `params` is undefined.
      const rawParams = (routeCtx ? await routeCtx.params : undefined) ?? {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v.join("/") : v;
      const result = await handler({ req, principal, query, body, params, page });
      if (result instanceof NextResponse || result instanceof Response) return result as NextResponse;
      return ok(result);
    } catch (e) {
      return jsonError(e);
    }
  };
}
