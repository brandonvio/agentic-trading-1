import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, StripSkeleton } from "@/app/(app)/_components/fallbacks";
import { OrderOrigin, OrderStatus, type OrderFilter } from "@/lib/domain/order";
import { OrdersTable } from "./_components/orders-table";
import { NewOrderLauncher, OrdersFilters } from "./_components/toolbar";

export const metadata: Metadata = {
  title: "Orders · Agentic Prop",
  description: "Order blotter across every visible portfolio, with pre-trade risk outcomes and approvals.",
};

export const dynamic = "force-dynamic";

/** First value of a search param, ignoring repeats. */
function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function OrdersPage(props: PageProps<"/orders">) {
  const searchParams = await props.searchParams;
  const status = OrderStatus.safeParse(one(searchParams.status));
  const origin = OrderOrigin.safeParse(one(searchParams.origin));
  const portfolioId = one(searchParams.portfolioId);

  const filter: OrderFilter = {
    ...(status.success ? { status: status.data } : {}),
    ...(origin.success ? { origin: origin.data } : {}),
    ...(portfolioId ? { portfolioId } : {}),
  };
  const filtered = Object.keys(filter).length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Every ticket routed from a visible portfolio, whether raised by a trader, a strategy or an autonomous agent."
        actions={
          <Suspense fallback={<Skeleton className="h-7 w-24" />}>
            <NewOrderLauncher />
          </Suspense>
        }
      />

      <Suspense fallback={<StripSkeleton />}>
        <OrdersFilters values={{ status: status.success ? status.data : undefined, origin: origin.success ? origin.data : undefined, portfolioId }} />
      </Suspense>

      <Suspense key={`${status.success ? status.data : ""}|${origin.success ? origin.data : ""}|${portfolioId ?? ""}`} fallback={<CardSkeleton rows={10} cols={9} />}>
        <OrdersTable filter={filter} filtered={filtered} />
      </Suspense>
    </div>
  );
}
