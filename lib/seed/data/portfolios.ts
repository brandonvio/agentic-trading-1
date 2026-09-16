/** Portfolios and the broker accounts that fund them. */
import type { Portfolio, BrokerAccount, PortfolioMandate, PortfolioStatus, BrokerAccountStatus } from "@/lib/domain/portfolio";
import { ASSET_CLASS_BROKER, type AssetClass, type BrokerKey } from "@/lib/domain/instrument";
import { ID_PREFIX } from "@/lib/core/ids";
import { round, type SeedContext } from "../context";
import type { DeskCode, OrgBundle } from "./org";

export type PortfolioCode = "GM-ALPHA" | "GM-CARRY" | "EQD-VOL" | "SYS-TREND" | "DA-CORE" | "DA-ARB" | "EV-MACRO" | "MS-FLAG";

interface PortfolioSpec {
  code: PortfolioCode;
  name: string;
  desk: DeskCode;
  description: string;
  nav: number;
  inceptionCapital: number;
  cashFraction: number;
  status: PortfolioStatus;
  mandate: PortfolioMandate;
  inceptionDaysAgo: number;
}

const mandate = (assetClasses: AssetClass[], maxGrossLeverage: number, maxConcentration: number, agentTradingEnabled: boolean, agentApprovalThresholdNotional: number): PortfolioMandate => ({
  assetClasses,
  maxGrossLeverage,
  maxConcentration,
  agentTradingEnabled,
  agentApprovalThresholdNotional,
});

const PORTFOLIO_SPECS: readonly PortfolioSpec[] = [
  {
    code: "GM-ALPHA",
    name: "Global Macro Alpha",
    desk: "GM",
    description: "Discretionary macro book expressing rates, FX and equity-index views through futures, spot FX and liquid ETFs. Sized off the desk's monthly macro scenario grid.",
    nav: 820_000_000,
    inceptionCapital: 650_000_000,
    cashFraction: 0.42,
    status: "active",
    mandate: mandate(["forex", "future", "equity"], 4.0, 0.15, true, 25_000_000),
    inceptionDaysAgo: 400,
  },
  {
    code: "GM-CARRY",
    name: "G10 FX Carry",
    desk: "GM",
    description: "Systematic G10 carry basket: long high-yielders against funding currencies, vol-targeted at 8% with a drawdown circuit breaker.",
    nav: 410_000_000,
    inceptionCapital: 350_000_000,
    cashFraction: 0.55,
    status: "active",
    mandate: mandate(["forex"], 5.0, 0.35, true, 15_000_000),
    inceptionDaysAgo: 380,
  },
  {
    code: "EQD-VOL",
    name: "Equity Volatility",
    desk: "EQD",
    description: "Short index and single-name variance with delta hedged in the underlying ETFs and shares. Wings bought at 10-delta to cap tail loss.",
    nav: 650_000_000,
    inceptionCapital: 500_000_000,
    cashFraction: 0.6,
    status: "active",
    mandate: mandate(["option", "equity"], 3.0, 0.2, true, 10_000_000),
    inceptionDaysAgo: 395,
  },
  {
    code: "SYS-TREND",
    name: "Systematic Trend",
    desk: "SYS",
    description: "Multi-horizon trend following across equity index, rates, energy, metals and FX futures. Risk parity weighting, 12% vol target.",
    nav: 720_000_000,
    inceptionCapital: 600_000_000,
    cashFraction: 0.7,
    status: "active",
    mandate: mandate(["future"], 6.0, 0.25, true, 20_000_000),
    inceptionDaysAgo: 400,
  },
  {
    code: "DA-CORE",
    name: "Digital Assets Core",
    desk: "DA",
    description: "Directional crypto book: BTC/ETH core longs with a momentum long/short overlay in large-cap alts. Spot only on Coinbase.",
    nav: 380_000_000,
    inceptionCapital: 250_000_000,
    cashFraction: 0.2,
    status: "active",
    mandate: mandate(["crypto"], 2.0, 0.5, true, 5_000_000),
    inceptionDaysAgo: 360,
  },
  {
    code: "DA-ARB",
    name: "Digital Basis Arbitrage",
    desk: "DA",
    description: "Cash-and-carry: long spot BTC/ETH on Coinbase against short CME quarterly futures, harvesting the annualised basis. Frozen pending Coinbase connectivity review.",
    nav: 210_000_000,
    inceptionCapital: 200_000_000,
    cashFraction: 0.25,
    status: "frozen",
    mandate: mandate(["crypto", "future"], 3.0, 0.6, false, 5_000_000),
    inceptionDaysAgo: 300,
  },
  {
    code: "EV-MACRO",
    name: "Event Driven Macro",
    desk: "EV",
    description: "Probability trading on Kalshi macro contracts (FOMC path, inflation prints, index thresholds) where model-implied odds diverge from market odds.",
    nav: 160_000_000,
    inceptionCapital: 150_000_000,
    cashFraction: 0.9,
    status: "active",
    mandate: mandate(["event"], 1.5, 0.1, true, 2_000_000),
    inceptionDaysAgo: 270,
  },
  {
    code: "MS-FLAG",
    name: "Multi-Strategy Flagship",
    desk: "GM",
    description: "Cross-asset flagship sleeve that takes scaled allocations from every live strategy on the platform; the CIO's showcase book for allocators.",
    nav: 250_000_000,
    inceptionCapital: 250_000_000,
    cashFraction: 0.5,
    status: "active",
    mandate: mandate(["equity", "option", "future", "forex", "crypto", "event"], 3.0, 0.15, true, 10_000_000),
    inceptionDaysAgo: 120,
  },
];

interface AccountTemplate {
  externalId: (n: number) => string;
  label: string;
  leverage: number;
}

const ACCOUNT_TEMPLATES: Record<BrokerKey, AccountTemplate> = {
  ibkr: { externalId: (n) => `U${(1_234_567 + n * 4_183).toString()}`, label: "Interactive Brokers", leverage: 4 },
  oanda: { externalId: (n) => `001-001-${(1_234_567 + n * 7_919).toString()}-001`, label: "OANDA", leverage: 20 },
  tradovate: { externalId: (n) => `TV-${(88_123 + n * 911).toString()}`, label: "Tradovate", leverage: 8 },
  coinbase: { externalId: (n) => `cb-acct-${(0x3f8a2c + n * 0x1a7).toString(16)}`, label: "Coinbase Prime", leverage: 1 },
  kalshi: { externalId: (n) => `kalshi-${(51_000 + n * 137).toString()}`, label: "Kalshi", leverage: 1 },
};

export interface PortfolioBundle {
  portfolios: Portfolio[];
  brokerAccounts: BrokerAccount[];
  portfolioByCode: (code: PortfolioCode) => Portfolio;
  accountFor: (portfolioId: string, broker: BrokerKey) => BrokerAccount;
}

export function generatePortfolios(ctx: SeedContext, org: OrgBundle): PortfolioBundle {
  const portfolios: Portfolio[] = [];
  const brokerAccounts: BrokerAccount[] = [];
  let accountCounter = 0;

  for (const spec of PORTFOLIO_SPECS) {
    const desk = org.deskByCode(spec.desk);
    const manager = org.users.find((u) => u.id === desk.headUserId);
    if (!manager) throw new Error(`Seed generation error: desk ${spec.desk} has no head`);
    const cash = round(spec.nav * spec.cashFraction, 2);
    const createdAt = ctx.daysAgo(spec.inceptionDaysAgo);
    const portfolio: Portfolio = {
      id: ctx.ids.next(ID_PREFIX.portfolio),
      deskId: desk.id,
      code: spec.code,
      name: spec.name,
      description: spec.description,
      baseCurrency: "USD",
      status: spec.status,
      managerUserId: manager.id,
      nav: spec.nav,
      navAsOf: ctx.hoursAgo(0.25),
      inceptionCapital: spec.inceptionCapital,
      cash,
      mandate: spec.mandate,
      createdAt,
      updatedAt: ctx.hoursAgo(0.25),
    };
    portfolios.push(portfolio);

    const brokers = [...new Set(spec.mandate.assetClasses.map((ac) => ASSET_CLASS_BROKER[ac]))];
    // Split cash across accounts: the first broker (primary) gets the largest share.
    const weights = brokers.map((_, i) => (i === 0 ? 1 : 0.45));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    brokers.forEach((broker, i) => {
      accountCounter += 1;
      const tpl = ACCOUNT_TEMPLATES[broker];
      const cashBalance = round((cash * weights[i]) / totalWeight, 2);
      const marginUsed = round(cashBalance * ctx.rng.range(0.08, 0.35), 2);
      let status: BrokerAccountStatus = "connected";
      if (spec.code === "DA-ARB" && broker === "coinbase") status = "degraded";
      if (spec.code === "MS-FLAG" && broker === "kalshi") status = "paper";
      brokerAccounts.push({
        id: ctx.ids.next(ID_PREFIX.brokerAccount),
        portfolioId: portfolio.id,
        broker,
        externalAccountId: tpl.externalId(accountCounter),
        label: `${tpl.label} · ${spec.code}${status === "paper" ? " (paper)" : ""}`,
        currency: "USD",
        status,
        cashBalance,
        buyingPower: round(cashBalance * tpl.leverage - marginUsed, 2),
        marginUsed,
        lastHeartbeatAt: status === "degraded" ? ctx.hoursAgo(3.4) : ctx.hoursAgo(ctx.rng.range(0.01, 0.08)),
        createdAt,
        updatedAt: ctx.hoursAgo(ctx.rng.range(0.01, 0.5)),
      });
    });
  }

  const portfolioByCode = (code: PortfolioCode): Portfolio => {
    const p = portfolios.find((x) => x.code === code);
    if (!p) throw new Error(`Seed generation error: unknown portfolio ${code}`);
    return p;
  };
  const accountFor = (portfolioId: string, broker: BrokerKey): BrokerAccount => {
    const a = brokerAccounts.find((x) => x.portfolioId === portfolioId && x.broker === broker);
    if (!a) throw new Error(`Seed generation error: portfolio ${portfolioId} has no ${broker} account`);
    return a;
  };

  return { portfolios, brokerAccounts, portfolioByCode, accountFor };
}
