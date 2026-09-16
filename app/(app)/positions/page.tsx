import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { PositionFilters } from "./_components/filters";
import { PositionsTable } from "./_components/positions-table";
import { PositionSummary, PositionSummaryFallback } from "./_components/summary-tiles";
import { param } from "./_components/data";

export const metadata: Metadata = {
  title: "Positions · Agentic Prop",
  description: "Every open and closed position across the portfolios your role can see.",
};

export const dynamic = "force-dynamic";

export default async function PositionsPage(props: PageProps<"/positions">) {
  const sp = await props.searchParams;
  const portfolioId = param(sp.portfolioId);
  const assetClass = param(sp.assetClass);
  const open = param(sp.open);
  const key = `${portfolioId ?? ""}:${assetClass ?? ""}:${open ?? ""}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Positions"
        description="Marks, exposure and P&L for every position your role can see. Close an open position to route a flattening market order through pre-trade risk."
      />

      <Suspense key={`s:${key}`} fallback={<PositionSummaryFallback />}>
        <PositionSummary portfolioId={portfolioId} assetClass={assetClass} open={open} />
      </Suspense>

      <Suspense fallback={<StripSkeleton />}>
        <PositionFilters portfolioId={portfolioId} assetClass={assetClass} open={open} />
      </Suspense>

      <Suspense key={`t:${key}`} fallback={<CardSkeleton rows={10} cols={10} />}>
        <PositionsTable portfolioId={portfolioId} assetClass={assetClass} open={open} />
      </Suspense>
    </div>
  );
}
