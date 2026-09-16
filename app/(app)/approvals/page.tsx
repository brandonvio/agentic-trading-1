import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { CardSkeleton } from "../_components/fallbacks";
import { firstParam, oneOf } from "./_components/data";
import { DecidedHistory } from "./_components/decided";
import { PendingQueue } from "./_components/pending";
import { ApprovalStats } from "./_components/stats";

export const metadata: Metadata = {
  title: "Approvals · Agentic Prop",
  description: "Four-eyes approval queue for orders, strategy deployments and risk overrides.",
};

export const dynamic = "force-dynamic";

const TABS = ["pending", "decided"] as const;

const TAB_ITEMS: TabItem[] = [
  { value: "pending", label: "Pending" },
  { value: "decided", label: "Decided" },
];

export default async function ApprovalsPage(props: PageProps<"/approvals">) {
  const searchParams = await props.searchParams;
  const tab = oneOf(firstParam(searchParams.tab), TABS) ?? "pending";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description="Requests that need a second pair of eyes. The requester can never decide their own request."
      />

      <Suspense fallback={<SkeletonTiles count={4} />}>
        <ApprovalStats />
      </Suspense>

      <Tabs basePath="/approvals" items={TAB_ITEMS} active={tab} ariaLabel="Approval sections" />

      {tab === "pending" ? (
        <Suspense fallback={<CardSkeleton rows={5} cols={7} />}>
          <PendingQueue />
        </Suspense>
      ) : (
        <Suspense fallback={<CardSkeleton rows={5} cols={7} />}>
          <DecidedHistory />
        </Suspense>
      )}
    </div>
  );
}
