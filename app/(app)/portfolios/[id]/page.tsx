import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { CardSkeleton, DetailSkeleton } from "@/app/(app)/_components/fallbacks";
import { PageGuard } from "@/app/(app)/_components/guard";
import { loadDeskIndex, loadUserIndex } from "@/app/(app)/_lib/data";
import { param } from "../_components/data";
import { loadPortfolio } from "./_components/data";
import { PortfolioActions } from "./_components/actions";
import { SnapshotTiles, SnapshotTilesFallback } from "./_components/snapshot-tiles";
import { MandatePanel } from "./_components/mandate-panel";
import { PositionsTab } from "./_components/positions-tab";
import { OrdersTab } from "./_components/orders-tab";
import { RiskTab } from "./_components/risk-tab";
import { StrategiesTab } from "./_components/strategies-tab";
import { AgentsTab } from "./_components/agents-tab";

export const metadata: Metadata = {
  title: "Portfolio · Agentic Prop",
  description: "Positions, orders, risk, strategies and agents for a single portfolio.",
};

export const dynamic = "force-dynamic";

const TABS = ["positions", "orders", "risk", "strategies", "agents"] as const;
type TabValue = (typeof TABS)[number];

const TAB_ITEMS: TabItem[] = [
  { value: "positions", label: "Positions" },
  { value: "orders", label: "Orders" },
  { value: "risk", label: "Risk" },
  { value: "strategies", label: "Strategies" },
  { value: "agents", label: "Agents" },
];

function tabValue(raw: string | undefined): TabValue {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as TabValue) : "positions";
}

export default async function PortfolioDetailPage(props: PageProps<"/portfolios/[id]">) {
  const { id } = await props.params;
  const tab = tabValue(param((await props.searchParams).tab));
  const result = await loadPortfolio(id);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return (
      <div className="space-y-4">
        <PageHeader title="Portfolio" breadcrumbs={[{ label: "Portfolios", href: "/portfolios" }, { label: id }]} />
        <PageGuard result={result} what="this portfolio">
          {() => null}
        </PageGuard>
      </div>
    );
  }

  const portfolio = result.value;
  const [desks, users] = await Promise.all([loadDeskIndex(), loadUserIndex()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={portfolio.name}
        breadcrumbs={[{ label: "Portfolios", href: "/portfolios" }, { label: portfolio.code }]}
        description={portfolio.description}
        meta={
          <>
            <span className="num text-xs text-fg-subtle">{portfolio.code}</span>
            <StatusBadge kind="portfolio" value={portfolio.status} />
          </>
        }
        actions={<PortfolioActions portfolioId={portfolio.id} />}
      />

      <Suspense fallback={<SnapshotTilesFallback />}>
        <SnapshotTiles portfolioId={portfolio.id} currency={portfolio.baseCurrency} />
      </Suspense>

      <Suspense fallback={<DetailSkeleton lines={3} />}>
        <MandatePanel portfolio={portfolio} desk={desks.get(portfolio.deskId)} manager={users.get(portfolio.managerUserId)} />
      </Suspense>

      <Tabs basePath={`/portfolios/${portfolio.id}`} items={TAB_ITEMS} active={tab} ariaLabel="Portfolio sections" />

      <section aria-label={`${tab} for ${portfolio.name}`}>
        <Suspense key={tab} fallback={<CardSkeleton rows={6} cols={8} />}>
          {tab === "positions" ? <PositionsTab portfolioId={portfolio.id} currency={portfolio.baseCurrency} /> : null}
          {tab === "orders" ? <OrdersTab portfolioId={portfolio.id} currency={portfolio.baseCurrency} /> : null}
          {tab === "risk" ? <RiskTab portfolioId={portfolio.id} /> : null}
          {tab === "strategies" ? <StrategiesTab portfolioId={portfolio.id} currency={portfolio.baseCurrency} /> : null}
          {tab === "agents" ? <AgentsTab portfolioId={portfolio.id} /> : null}
        </Suspense>
      </section>
    </div>
  );
}
