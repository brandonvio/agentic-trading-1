import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatMoney, formatQty, formatSymbol } from "@/lib/ui/format";
import { isForbidden } from "@/lib/ui/safe";
import { StatusBadge } from "@/components/ui/badge";
import { NotPermitted } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, DetailSkeleton } from "@/app/(app)/_components/fallbacks";
import { TERMINAL_ORDER_STATUSES } from "@/lib/domain/order";
import { CancelOrderButton } from "../_components/cancel-order-button";
import { loadOrder } from "../_components/data";
import { OrderAuditTimeline } from "./_components/audit-timeline";
import { OrderFills } from "./_components/fills";
import { OrderApproval, OrderProvenance } from "./_components/links";
import { OrderParameters } from "./_components/parameters";
import { OrderRiskChecks } from "./_components/risk-checks";

export const metadata: Metadata = {
  title: "Order · Agentic Prop",
  description: "Order parameters, pre-trade risk checks, fills, approval and audit trail.",
};

export const dynamic = "force-dynamic";

export default async function OrderDetailPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const result = await loadOrder(id);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return (
      <div className="space-y-4">
        <PageHeader title="Order" breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: id }]} />
        {isForbidden(result) ? (
          <NotPermitted what="this order" compact={false} />
        ) : (
          <p role="alert" className="text-xs text-negative">
            {result.error.message}
          </p>
        )}
      </div>
    );
  }

  const order = result.value;
  const cancellable = !TERMINAL_ORDER_STATUSES.includes(order.status);

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: formatSymbol(order.symbol) }]}
        title={
          <span className="num">
            {order.side} {formatQty(order.quantity)} {formatSymbol(order.symbol)}
          </span>
        }
        description={`${order.type.replace("_", " ")} · ${order.timeInForce} · ${formatMoney(order.estimatedNotional, "USD", { compact: true })} estimated notional`}
        meta={
          <>
            <StatusBadge kind="order" value={order.status} />
            <StatusBadge kind="side" value={order.side} size="sm" dot={false} />
          </>
        }
        actions={cancellable ? <CancelOrderButton orderId={order.id} symbol={order.symbol} size="sm" /> : null}
      />

      <Suspense fallback={<DetailSkeleton lines={6} />}>
        <OrderParameters order={order} />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-2">
        <OrderRiskChecks order={order} />
        <Suspense fallback={<CardSkeleton rows={4} cols={6} />}>
          <OrderFills orderId={order.id} />
        </Suspense>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<DetailSkeleton lines={4} />}>
          <OrderProvenance order={order} />
        </Suspense>
        <Suspense fallback={<DetailSkeleton lines={4} />}>
          <OrderApproval order={order} />
        </Suspense>
      </div>

      <Suspense fallback={<DetailSkeleton lines={5} />}>
        <OrderAuditTimeline orderId={order.id} />
      </Suspense>
    </div>
  );
}
