import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { GridSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { AgentFilters } from "./_components/agent-filters";
import { AgentGrid } from "./_components/agent-grid";
import { AgentUsageStrip } from "./_components/usage-strip";
import { asKind, asStatus, firstParam } from "./_components/data";

export const metadata: Metadata = {
  title: "Agents · Agentic Prop",
  description: "Autonomous and supervised trading agents, their mandates, guardrails and activity.",
};

export const dynamic = "force-dynamic";

export default async function AgentsPage(props: PageProps<"/agents">) {
  const sp = await props.searchParams;
  const kind = firstParam(sp.kind);
  const status = firstParam(sp.status);
  const portfolioId = firstParam(sp.portfolioId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agents"
        description="Every agent your role can see, with its autonomy level, guardrails, tools and latest activity. Runs execute synchronously against the mock LLM gateway."
      />

      <Suspense fallback={<SkeletonTiles count={6} />}>
        <AgentUsageStrip />
      </Suspense>

      <Suspense fallback={<StripSkeleton />}>
        <AgentFilters kind={kind} status={status} portfolioId={portfolioId} />
      </Suspense>

      <Suspense fallback={<GridSkeleton count={6} />}>
        <AgentGrid kind={asKind(kind)} status={asStatus(status)} portfolioId={portfolioId} />
      </Suspense>
    </div>
  );
}
