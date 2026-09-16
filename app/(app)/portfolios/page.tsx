import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { FirmTiles, FirmTilesFallback } from "./_components/firm-tiles";
import { PortfolioFilters } from "./_components/filters";
import { PortfoliosTable } from "./_components/portfolios-table";
import { param } from "./_components/data";

export const metadata: Metadata = {
  title: "Portfolios · Agentic Prop",
  description: "NAV, day P&L, leverage and status for every portfolio your role can see.",
};

export const dynamic = "force-dynamic";

export default async function PortfoliosPage(props: PageProps<"/portfolios">) {
  const sp = await props.searchParams;
  const deskId = param(sp.deskId);
  const status = param(sp.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolios"
        description="Every portfolio your role can access, with live NAV, day P&L, leverage and open position counts."
      />

      <Suspense fallback={<FirmTilesFallback />}>
        <FirmTiles />
      </Suspense>

      <Suspense fallback={<StripSkeleton />}>
        <PortfolioFilters deskId={deskId} status={status} />
      </Suspense>

      <Suspense key={`${deskId ?? ""}:${status ?? ""}`} fallback={<CardSkeleton rows={8} cols={9} />}>
        <PortfoliosTable deskId={deskId} status={status} />
      </Suspense>
    </div>
  );
}
