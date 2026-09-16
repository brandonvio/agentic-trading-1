import { formatDateTime, formatMoney, formatQty, formatRelative } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow } from "@/app/(app)/_lib/data";
import type { Signal } from "@/lib/domain/agent";
import type { Order } from "@/lib/domain/order";
import { loadOrdersForInstrument } from "../../_components/data";

function makeColumns(now: number): Column<Order>[] {
  return [
    {
      key: "createdAt",
      header: "Raised",
      mono: true,
      width: "7rem",
      render: (order) => (
        <span className="text-fg-muted" title={formatDateTime(order.createdAt, { seconds: true })}>
          {formatRelative(order.createdAt, now)}
        </span>
      ),
    },
    { key: "side", header: "Side", width: "4.5rem", render: (order) => <StatusBadge kind="side" value={order.side} size="xs" dot={false} /> },
    { key: "type", header: "Type", width: "6rem", render: (order) => <span className="num text-fg-muted">{order.type.replace("_", " ")}</span> },
    {
      key: "quantity",
      header: "Filled / Qty",
      align: "right",
      render: (order) => `${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)}`,
    },
    { key: "estimatedNotional", header: "Notional", align: "right", render: (order) => formatMoney(order.estimatedNotional, "USD", { compact: true }) },
    { key: "status", header: "Status", width: "9.5rem", render: (order) => <StatusBadge kind="order" value={order.status} size="xs" /> },
  ];
}

/**
 * Orders raised from this signal. `OrderFilter` has no `signalId`, so this
 * lists the instrument's orders and narrows them to this signal.
 */
export async function ResultingOrders({ signal }: { signal: Signal }) {
  const [orders, now] = await Promise.all([loadOrdersForInstrument(signal.instrumentId), loadNow()]);
  const columns = makeColumns(now);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="raised from this idea">Orders</CardTitle>
      </CardHeader>
      <Guard result={orders} what="orders">
        {(paged) => {
          const rows = paged.items.filter((order) => order.signalId === signal.id).slice(0, 25);
          return (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(order) => order.id}
              rowHref={(order) => `/orders/${order.id}`}
              caption="Orders raised from this signal"
              emptyTitle="No orders yet"
              emptyDescription={
                signal.status === "new"
                  ? "Nobody has acted on this signal. Use Act to raise an order through pre-trade risk."
                  : "This signal never produced an order."
              }
            />
          );
        }}
      </Guard>
    </Card>
  );
}
