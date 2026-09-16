import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { FirmStats } from "./_components/firm-stats";
import { MarketRegimeStrip } from "./_components/market-strip";
import { PortfoliosTable } from "./_components/portfolios-table";
import { ExposureBreakdown } from "./_components/exposure-breakdown";
import { DesksTable } from "./_components/desks-table";
import { OpenBreaches } from "./_components/risk-breaches";
import { RecentAgentRuns } from "./_components/agent-runs";
import { LatestSignals } from "./_components/latest-signals";
import { CardSkeleton, StripSkeleton } from "./_components/fallbacks";

export const metadata: Metadata = {
  title: "Firm overview · Agentic Prop",
  description: "Firm-wide NAV, P&L, exposure, agent activity and risk posture.",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Firm overview"
        description="Consolidated NAV, exposure and agent activity across every desk and portfolio your role can see."
        meta={
          <Badge tone="warning" dot>
            Mock · Paper
          </Badge>
        }
      />

      <Suspense fallback={<SkeletonTiles count={8} />}>
        <FirmStats />
      </Suspense>

      <Suspense fallback={<StripSkeleton />}>
        <MarketRegimeStrip />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Suspense fallback={<CardSkeleton rows={6} cols={7} />}>
            <PortfoliosTable />
          </Suspense>
        </div>
        <Suspense fallback={<CardSkeleton rows={5} cols={3} />}>
          <ExposureBreakdown />
        </Suspense>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Suspense fallback={<CardSkeleton rows={4} cols={4} />}>
          <DesksTable />
        </Suspense>
        <div className="min-w-0 xl:col-span-2">
          <Suspense fallback={<CardSkeleton rows={4} cols={5} />}>
            <OpenBreaches />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<CardSkeleton rows={5} cols={5} />}>
          <RecentAgentRuns />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={5} cols={5} />}>
          <LatestSignals />
        </Suspense>
      </div>
    </div>
  );
}
