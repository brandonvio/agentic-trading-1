import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { StrategiesTable } from "./_components/strategies-table";
import { StrategyFilters } from "./_components/strategy-filters";
import { asStrategyStatus, asStrategyStyle, firstParam } from "./_components/data";

export const metadata: Metadata = {
  title: "Strategies · Agentic Prop",
  description: "Research, backtested, paper and live strategies with their performance and deployments.",
};

export const dynamic = "force-dynamic";

export default async function StrategiesPage(props: PageProps<"/strategies">) {
  const sp = await props.searchParams;
  const status = firstParam(sp.status);
  const style = firstParam(sp.style);
  const deskId = firstParam(sp.deskId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategies"
        description="Every strategy your role can see, from research through to live deployment, with backtest and live performance side by side."
      />

      <Suspense fallback={<StripSkeleton />}>
        <StrategyFilters status={status} style={style} deskId={deskId} />
      </Suspense>

      <Suspense fallback={<CardSkeleton rows={8} cols={11} />}>
        <StrategiesTable status={asStrategyStatus(status)} style={asStrategyStyle(style)} deskId={deskId} />
      </Suspense>
    </div>
  );
}
