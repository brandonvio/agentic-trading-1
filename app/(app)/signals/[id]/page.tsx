import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatPct, formatSymbol } from "@/lib/ui/format";
import { isForbidden } from "@/lib/ui/safe";
import { StatusBadge } from "@/components/ui/badge";
import { NotPermitted } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, DetailSkeleton } from "@/app/(app)/_components/fallbacks";
import { loadSignal } from "../_components/data";
import { ActSignalButton, DismissSignalButton } from "../_components/signal-actions";
import { SignalFactors } from "./_components/factors";
import { SignalProvenance } from "./_components/provenance";
import { ResultingOrders } from "./_components/resulting-orders";
import { SignalThesis } from "./_components/thesis";

export const metadata: Metadata = {
  title: "Signal · Agentic Prop",
  description: "Signal thesis, weighted factors, source run and the orders it produced.",
};

export const dynamic = "force-dynamic";

export default async function SignalDetailPage(props: PageProps<"/signals/[id]">) {
  const { id } = await props.params;
  const result = await loadSignal(id);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return (
      <div className="space-y-4">
        <PageHeader title="Signal" breadcrumbs={[{ label: "Signals", href: "/signals" }, { label: id }]} />
        {isForbidden(result) ? (
          <NotPermitted what="this signal" compact={false} />
        ) : (
          <p role="alert" className="text-xs text-negative">
            {result.error.message}
          </p>
        )}
      </div>
    );
  }

  const signal = result.value;
  const actionable = signal.status === "new";

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Signals", href: "/signals" }, { label: formatSymbol(signal.symbol) }]}
        title={<span className="num">{formatSymbol(signal.symbol)}</span>}
        description={`${signal.direction} idea, ${formatPct(signal.expectedReturnPct, { sign: true })} expected over ${Math.round(signal.horizonHours)}h.`}
        meta={
          <>
            <StatusBadge kind="direction" value={signal.direction} dot={false} />
            <StatusBadge kind="signal" value={signal.status} />
          </>
        }
        actions={
          actionable ? (
            <>
              <ActSignalButton signalId={signal.id} symbol={signal.symbol} size="sm" />
              <DismissSignalButton signalId={signal.id} symbol={signal.symbol} size="sm" />
            </>
          ) : null
        }
      />

      <Suspense fallback={<DetailSkeleton lines={6} />}>
        <SignalThesis signal={signal} />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-2">
        <SignalFactors signal={signal} />
        <Suspense fallback={<DetailSkeleton lines={5} />}>
          <SignalProvenance signal={signal} />
        </Suspense>
      </div>

      <Suspense fallback={<CardSkeleton rows={3} cols={6} />}>
        <ResultingOrders signal={signal} />
      </Suspense>
    </div>
  );
}
