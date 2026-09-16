/**
 * Shared harness for app/api route-handler integration tests.
 *
 * - Builds an in-memory container and installs it as the process singleton
 *   (`globalThis.__agenticPropContainer`) that route handlers resolve through
 *   `getContainer()` / `services()`.
 * - Seeds a minimal but complete world directly through the repositories.
 * - Drives handlers with real `NextRequest`s (cookies, JSON bodies, params).
 *
 * Nothing in the service layer is stubbed: requests exercise the real wiring.
 */
import { NextRequest } from "next/server";
import { buildContainer } from "@/lib/container";
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { User } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { Instrument } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount } from "@/lib/domain/portfolio";
import type { Strategy } from "@/lib/domain/strategy";
import type { Agent } from "@/lib/domain/agent";
import type { RiskLimit } from "@/lib/domain/risk";
import {
  buildAllRoles,
  buildUser,
  buildDesk,
  buildEquity,
  buildForex,
  buildCrypto,
  buildPortfolio,
  buildBrokerAccount,
  buildStrategy,
  buildAgent,
  buildRiskLimit,
} from "@/tests/fixtures/entities";
import { POST as loginRoute } from "@/app/api/auth/login/route";

export interface ApiWorld {
  container: Container;
  repos: Repositories;
  users: {
    admin: User;
    cio: User;
    pm: User;
    trader: User;
    quant: User;
    riskManager: User;
    compliance: User;
    ops: User;
    analyst: User;
  };
  desk: Desk;
  otherDesk: Desk;
  portfolio: Portfolio;
  accounts: { ibkr: BrokerAccount; oanda: BrokerAccount; coinbase: BrokerAccount };
  instruments: { aapl: Instrument; msft: Instrument; eurusd: Instrument; btc: Instrument };
  strategy: Strategy;
  agent: Agent;
  limit: RiskLimit;
}

/** Build + install the container and seed fixtures. Call once per test file (beforeAll). */
export async function setupApiWorld(): Promise<ApiWorld> {
  const container = buildContainer({ persistence: "memory" });
  globalThis.__agenticPropContainer = container;
  const repos = container.resolve(TOKENS.repos);

  for (const role of buildAllRoles()) await repos.roles.upsert(role);

  const desk = await repos.desks.create(buildDesk({ code: "MACRO", name: "Global Macro", focus: "global_macro" }));
  const otherDesk = await repos.desks.create(buildDesk({ code: "DIGI", name: "Digital Assets", focus: "digital_assets" }));

  const mk = (email: string, name: string, title: string, roles: User["roles"], deskIds: string[] = [desk.id]) =>
    repos.users.create(buildUser({ email, name, title, roles, deskIds }));

  const users = {
    admin: await mk("admin@example.test", "Ada Admin", "Platform Admin", ["global_admin"], []),
    cio: await mk("cio@example.test", "Cara CIO", "Chief Investment Officer", ["cio"], []),
    pm: await mk("pm@example.test", "Pat Manager", "Portfolio Manager", ["portfolio_manager"]),
    trader: await mk("trader@example.test", "Tom Trader", "Trader", ["trader"]),
    quant: await mk("quant@example.test", "Quinn Quant", "Quant Researcher", ["quant_researcher"]),
    riskManager: await mk("risk@example.test", "Rita Risk", "Risk Manager", ["risk_manager"], []),
    compliance: await mk("compliance@example.test", "Cole Compliance", "Compliance Officer", ["compliance_officer"], []),
    ops: await mk("ops@example.test", "Olive Ops", "Operations", ["operations"], []),
    analyst: await mk("analyst@example.test", "Andy Analyst", "Analyst", ["analyst"]),
  };

  await repos.desks.update(desk.id, { headUserId: users.pm.id });

  const portfolio = await repos.portfolios.create(
    buildPortfolio({ deskId: desk.id, managerUserId: users.pm.id, code: "MACRO-1", name: "Macro Alpha" }),
  );

  const accounts = {
    ibkr: await repos.brokerAccounts.create(buildBrokerAccount({ portfolioId: portfolio.id, broker: "ibkr" })),
    oanda: await repos.brokerAccounts.create(buildBrokerAccount({ portfolioId: portfolio.id, broker: "oanda" })),
    coinbase: await repos.brokerAccounts.create(buildBrokerAccount({ portfolioId: portfolio.id, broker: "coinbase" })),
  };

  const instruments = {
    aapl: await repos.instruments.create(buildEquity({ symbol: "AAPL", name: "Apple Inc." })),
    msft: await repos.instruments.create(buildEquity({ symbol: "MSFT", name: "Microsoft Corp." })),
    eurusd: await repos.instruments.create(buildForex()),
    btc: await repos.instruments.create(buildCrypto()),
  };

  const strategy = await repos.strategies.create(
    buildStrategy({
      deskId: desk.id,
      ownerUserId: users.quant.id,
      code: "MOM-1",
      name: "Large-cap momentum",
      instrumentIds: [instruments.aapl.id, instruments.msft.id],
    }),
  );

  const agent = await repos.agents.create(
    buildAgent({
      ownerUserId: users.pm.id,
      kind: "market_intelligence",
      name: "Market Intel",
      portfolioId: portfolio.id,
      deskId: desk.id,
    }),
  );

  const limit = await repos.riskLimits.create(
    buildRiskLimit({
      createdByUserId: users.riskManager.id,
      name: "Platform gross leverage",
      scope: "platform",
      metric: "gross_exposure_pct_nav",
      threshold: 3,
      warnThreshold: 2.5,
      action: "block",
    }),
  );

  return { container, repos, users, desk, otherDesk, portfolio, accounts, instruments, strategy, agent, limit };
}

// ---------------------------------------------------------------------------
// Request driver
// ---------------------------------------------------------------------------

/** Any route export: `(req, ctx) => Response`. `never` for ctx accepts every RouteContext<…>. */
export type RouteHandler = (req: NextRequest, ctx: never) => Promise<Response>;

export interface CallOptions {
  cookie?: string | null;
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details: unknown;
}

export interface CallResult<T = unknown> {
  status: number;
  res: Response;
  json: { data?: T; error?: ApiErrorEnvelope } | null;
  data: T;
  error: ApiErrorEnvelope | undefined;
}

export async function call<T = unknown>(
  handler: RouteHandler,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: CallOptions = {},
): Promise<CallResult<T>> {
  const headers = new Headers(opts.headers);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const req = new NextRequest(`http://localhost:3001${path}`, { method, headers, body });
  const ctx = { params: Promise.resolve(opts.params ?? {}) };
  const res = await handler(req, ctx as never);
  const text = await res.text();
  const json = text ? (JSON.parse(text) as CallResult<T>["json"]) : null;
  return { status: res.status, res, json, data: json?.data as T, error: json?.error };
}

/** Log in through the real login route and return the `cookie` header value to send on later calls. */
export async function loginAs(email: string): Promise<string> {
  const req = new NextRequest("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
    body: JSON.stringify({ email }),
  });
  const res = await loginRoute(req);
  if (res.status !== 200) throw new Error(`login as ${email} failed: ${res.status} ${await res.text()}`);
  const token = res.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error(`login as ${email} did not set ${SESSION_COOKIE}`);
  return `${SESSION_COOKIE}=${token}`;
}

/** Shape assertion helper for `{ items, total, limit, offset }`. */
export function expectPaged(data: unknown): asserts data is { items: unknown[]; total: number; limit: number; offset: number } {
  const d = data as { items?: unknown; total?: unknown; limit?: unknown; offset?: unknown };
  if (!Array.isArray(d?.items) || typeof d.total !== "number" || typeof d.limit !== "number" || typeof d.offset !== "number") {
    throw new Error(`Expected paged envelope, got ${JSON.stringify(data)?.slice(0, 200)}`);
  }
}
