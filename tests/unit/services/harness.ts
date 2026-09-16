/**
 * Service test harness: a fully wired container over in-memory repositories,
 * a fake broker registry, a fixed clock and deterministic ids, plus a small
 * seeded world (desk, portfolio, accounts, instruments, users per role).
 */
import { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { FixedClock } from "@/lib/core/clock";
import { SequentialIdGenerator } from "@/lib/core/ids";
import { NoopLogger } from "@/lib/core/logger";
import { createInMemoryRepositories, type InMemoryRepositories } from "@/lib/repositories/memory";
import { registerServices } from "@/lib/services";
import { registerLLM } from "@/lib/llm";
import type { Principal, RoleKey, User } from "@/lib/domain/auth";
import { principalFromUser } from "@/lib/auth/permissions";
import type { Desk } from "@/lib/domain/org";
import type { Instrument } from "@/lib/domain/instrument";
import type { Portfolio, BrokerAccount } from "@/lib/domain/portfolio";
import { FakeBrokerRegistry, type FakeBrokerOptions } from "./fakes";
import {
  buildAllRoles,
  buildUser,
  buildDesk,
  buildEquity,
  buildForex,
  buildCrypto,
  buildPortfolio,
  buildBrokerAccount,
  resetFixtureIds,
  T0,
} from "@/tests/fixtures/entities";

export interface Harness {
  container: Container;
  repos: InMemoryRepositories;
  brokers: FakeBrokerRegistry;
  clock: FixedClock;
  desk: Desk;
  otherDesk: Desk;
  portfolio: Portfolio;
  accounts: { ibkr: BrokerAccount; oanda: BrokerAccount; coinbase: BrokerAccount };
  instruments: { aapl: Instrument; eurusd: Instrument; btc: Instrument };
  users: Record<"admin" | "cio" | "pm" | "trader" | "quant" | "risk" | "compliance" | "ops" | "analyst" | "otherTrader", User>;
  principal(key: keyof Harness["users"]): Principal;
  services: ReturnType<typeof resolveServices>;
}

function resolveServices(c: Container) {
  return {
    auth: c.resolve(TOKENS.authService),
    users: c.resolve(TOKENS.userService),
    desks: c.resolve(TOKENS.deskService),
    market: c.resolve(TOKENS.marketDataService),
    brokers: c.resolve(TOKENS.brokerService),
    portfolios: c.resolve(TOKENS.portfolioService),
    orders: c.resolve(TOKENS.orderService),
    risk: c.resolve(TOKENS.riskService),
    approvals: c.resolve(TOKENS.approvalService),
    strategies: c.resolve(TOKENS.strategyService),
    audit: c.resolve(TOKENS.auditService),
    // Resolved lazily: the agent workstream registers these, and service tests
    // that do not exercise agents should not require them to be present.
    get agents() {
      return c.resolve(TOKENS.agentService);
    },
    get signals() {
      return c.resolve(TOKENS.signalService);
    },
  };
}

const ROLE_OF: Record<keyof Harness["users"], RoleKey> = {
  admin: "global_admin",
  cio: "cio",
  pm: "portfolio_manager",
  trader: "trader",
  quant: "quant_researcher",
  risk: "risk_manager",
  compliance: "compliance_officer",
  ops: "operations",
  analyst: "analyst",
  otherTrader: "trader",
};

export async function createHarness(opts: { broker?: FakeBrokerOptions } = {}): Promise<Harness> {
  resetFixtureIds("hx");
  const clock = new FixedClock(T0);
  const repos = createInMemoryRepositories();
  const brokers = new FakeBrokerRegistry(opts.broker);

  const c = new Container();
  c.registerValue(TOKENS.clock, clock);
  c.registerValue(TOKENS.ids, new SequentialIdGenerator("hx"));
  c.registerValue(TOKENS.logger, new NoopLogger());
  c.registerValue(TOKENS.repos, repos);
  c.registerValue(TOKENS.repoAdmin, repos.admin);
  c.registerValue(TOKENS.brokers, brokers);
  registerLLM(c, "mock");
  registerServices(c);

  for (const role of buildAllRoles()) await repos.roles.upsert(role);

  const desk = buildDesk({ id: "desk_main", code: "GM", name: "Global Macro", focus: "global_macro" });
  const otherDesk = buildDesk({ id: "desk_other", code: "EQD", name: "Equity Derivatives", focus: "equity_derivatives" });
  await repos.desks.create(desk);
  await repos.desks.create(otherDesk);

  const users = {} as Harness["users"];
  for (const [key, role] of Object.entries(ROLE_OF) as Array<[keyof Harness["users"], RoleKey]>) {
    const user = buildUser({
      id: `usr_${key}`,
      email: `${key}@agenticprop.io`,
      name: `${key} user`,
      title: role,
      roles: [role],
      deskIds: key === "otherTrader" ? [otherDesk.id] : [desk.id],
    });
    users[key] = await repos.users.create(user);
  }

  const portfolio = await repos.portfolios.create(
    buildPortfolio({
      id: "pf_main",
      deskId: desk.id,
      code: "GM-ALPHA",
      name: "Global Macro Alpha",
      managerUserId: users.pm.id,
      nav: 100_000_000,
      cash: 100_000_000,
      inceptionCapital: 80_000_000,
      mandate: {
        assetClasses: ["equity", "forex", "crypto"],
        maxGrossLeverage: 3,
        maxConcentration: 0.25,
        agentTradingEnabled: true,
        agentApprovalThresholdNotional: 5_000_000,
      },
    }),
  );

  const accounts = {
    ibkr: await repos.brokerAccounts.create(buildBrokerAccount({ id: "acct_ibkr", portfolioId: portfolio.id, broker: "ibkr", cashBalance: 20_000_000, buyingPower: 60_000_000 })),
    oanda: await repos.brokerAccounts.create(buildBrokerAccount({ id: "acct_oanda", portfolioId: portfolio.id, broker: "oanda", cashBalance: 10_000_000, buyingPower: 30_000_000 })),
    coinbase: await repos.brokerAccounts.create(buildBrokerAccount({ id: "acct_cb", portfolioId: portfolio.id, broker: "coinbase", cashBalance: 10_000_000, buyingPower: 10_000_000 })),
  };

  const instruments = {
    aapl: await repos.instruments.create(buildEquity({ id: "ins_aapl", symbol: "AAPL" })),
    eurusd: await repos.instruments.create(buildForex({ id: "ins_eurusd", symbol: "EUR/USD" })),
    btc: await repos.instruments.create(buildCrypto({ id: "ins_btc", symbol: "BTC-USD" })),
  };

  const principals = new Map<string, Principal>();
  const harness: Harness = {
    container: c,
    repos,
    brokers,
    clock,
    desk,
    otherDesk,
    portfolio,
    accounts,
    instruments,
    users,
    principal(key) {
      const cached = principals.get(key);
      if (cached) return cached;
      const p = principalFromUser(users[key]);
      principals.set(key, p);
      return p;
    },
    services: resolveServices(c),
  };
  return harness;
}
