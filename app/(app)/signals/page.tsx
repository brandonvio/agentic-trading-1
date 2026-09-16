import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { SignalStatus } from "@/lib/domain/agent";
import { SignalsFilters } from "./_components/signals-filters";
import { SignalsTable } from "./_components/signals-table";
import type { SignalFilter } from "./_components/data";

export const metadata: Metadata = {
  title: "Signals · Agentic Prop",
  description: "Trade ideas produced by agents and strategies, with conviction, expected return and horizon.",
};

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  const status = SignalStatus.safeParse(one(searchParams.status));
  const portfolioId = one(searchParams.portfolioId);
  const agentId = one(searchParams.agentId);

  const filter: SignalFilter = {
    ...(status.success ? { status: status.data } : {}),
    ...(portfolioId ? { portfolioId } : {}),
    ...(agentId ? { agentId } : {}),
  };
  const filtered = Object.keys(filter).length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Signals"
        description="Every trade idea raised by a signal-generation agent or a deployed strategy, ranked by conviction. Acting on one raises an order through the full risk pipeline."
      />

      <Suspense fallback={<StripSkeleton />}>
        <SignalsFilters values={{ status: status.success ? status.data : undefined, portfolioId, agentId }} />
      </Suspense>

      <Suspense key={`${status.success ? status.data : ""}|${portfolioId ?? ""}|${agentId ?? ""}`} fallback={<CardSkeleton rows={10} cols={8} />}>
        <SignalsTable filter={filter} filtered={filtered} />
      </Suspense>
    </div>
  );
}
