import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { RiskBreachSeverity, RiskLimitScope } from "@/lib/domain/risk";
import { CardSkeleton } from "../_components/fallbacks";
import { BreachesPanel } from "./_components/breaches";
import { firstParam, oneOf } from "./_components/data";
import { FirmRiskStats } from "./_components/firm-stats";
import { LimitsPanel } from "./_components/limits";
import { PortfolioReports } from "./_components/portfolio-reports";

export const metadata: Metadata = {
  title: "Risk · Agentic Prop",
  description: "Firm risk posture: limit utilisation, breaches and the limit catalogue.",
};

export const dynamic = "force-dynamic";

const TABS = ["overview", "breaches", "limits"] as const;
const SEVERITIES = ["info", "warning", "critical"] as const satisfies readonly RiskBreachSeverity[];
const SCOPES = ["platform", "desk", "portfolio", "strategy", "agent"] as const satisfies readonly RiskLimitScope[];

const TAB_ITEMS: TabItem[] = [
  { value: "overview", label: "Overview" },
  { value: "breaches", label: "Breaches" },
  { value: "limits", label: "Limits" },
];

export default async function RiskPage(props: PageProps<"/risk">) {
  const searchParams = await props.searchParams;
  const tab = oneOf(firstParam(searchParams.tab), TABS) ?? "overview";
  const statusParam = firstParam(searchParams.status);
  const severity = oneOf(firstParam(searchParams.severity), SEVERITIES);
  const scope = oneOf(firstParam(searchParams.scope), SCOPES);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Risk"
        description="Limit utilisation, breaches and the limit catalogue across every portfolio your role can see."
        meta={
          <Badge tone="warning" dot>
            Mock · Paper
          </Badge>
        }
      />

      <Tabs basePath="/risk" items={TAB_ITEMS} active={tab} ariaLabel="Risk sections" />

      {tab === "overview" ? (
        <div className="space-y-4">
          <Suspense fallback={<SkeletonTiles count={8} />}>
            <FirmRiskStats />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={5} cols={5} />}>
            <PortfolioReports />
          </Suspense>
        </div>
      ) : null}

      {tab === "breaches" ? (
        <Suspense key={`breaches-${statusParam ?? ""}-${severity ?? ""}`} fallback={<CardSkeleton rows={6} cols={8} />}>
          <BreachesPanel statusParam={statusParam} severity={severity} />
        </Suspense>
      ) : null}

      {tab === "limits" ? (
        <Suspense key={`limits-${scope ?? ""}`} fallback={<CardSkeleton rows={6} cols={7} />}>
          <LimitsPanel scope={scope} />
        </Suspense>
      ) : null}
    </div>
  );
}
