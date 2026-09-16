import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { AssetClass, BrokerKey } from "@/lib/domain/instrument";
import { FilterBar } from "@/app/(app)/_components/filters";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { ASSET_CLASS_OPTIONS, BROKER_OPTIONS, asEnum, first } from "./_components/data";
import { MarketOverviewStrip } from "./_components/overview";
import { EventCalendar, MoversTable } from "./_components/movers";
import { InstrumentsTable } from "./_components/instruments-table";

export const metadata: Metadata = {
  title: "Market · Agentic Prop",
  description: "Instrument browser, live quotes and the firm's market regime view.",
};

export const dynamic = "force-dynamic";

export default async function MarketPage(props: PageProps<"/market">) {
  const sp = await props.searchParams;
  const search = first(sp.search);
  const assetClass = asEnum(AssetClass, sp.assetClass);
  const broker = asEnum(BrokerKey, sp.broker);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market"
        description="Regime, movers and the tradable instrument universe across every connected venue."
        meta={
          <Badge tone="info" dot>
            Simulated feed
          </Badge>
        }
      />

      <Suspense fallback={<StripSkeleton />}>
        <MarketOverviewStrip />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<CardSkeleton rows={6} cols={4} />}>
          <MoversTable />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={6} cols={2} />}>
          <EventCalendar />
        </Suspense>
      </div>

      <FilterBar
        basePath="/market"
        search={{ name: "search", value: search, label: "Instrument search", placeholder: "Symbol or name…" }}
        filters={[
          { name: "assetClass", label: "Asset class", value: assetClass, options: ASSET_CLASS_OPTIONS },
          { name: "broker", label: "Broker", value: broker, options: BROKER_OPTIONS },
        ]}
      />

      <Suspense key={`${search ?? ""}|${assetClass ?? ""}|${broker ?? ""}`} fallback={<CardSkeleton rows={10} cols={9} />}>
        <InstrumentsTable search={search} assetClass={assetClass} broker={broker} />
      </Suspense>
    </div>
  );
}
