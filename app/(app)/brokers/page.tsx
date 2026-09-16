import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { GridSkeleton } from "@/app/(app)/_components/fallbacks";
import { BrokerList } from "./_components/broker-list";

export const metadata: Metadata = {
  title: "Brokers · Agentic Prop",
  description: "Venue connectivity, capabilities and the accounts routed through each broker.",
};

export const dynamic = "force-dynamic";

export default function BrokersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Brokers"
        description="Connectivity and capabilities for every venue adapter, with the funded accounts behind each portfolio."
        meta={
          <Badge tone="warning" dot>
            Mock adapters
          </Badge>
        }
      />
      <Suspense fallback={<GridSkeleton count={4} />}>
        <BrokerList />
      </Suspense>
    </div>
  );
}
