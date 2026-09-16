import { formatMoney, formatQty, formatRelative, formatSymbol, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Order } from "@/lib/domain/order";
import type { Currency } from "@/lib/domain/common";
import { loadNow } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { loadOrders } from "./data";

function makeColumns(now: number, currency: Currency): Column<Order>[] {
  return [
    { key: "symbol", header: "Instrument", mono: true, render: (o) => <span className="font-medium text-fg">{formatSymbol(o.symbol)}</span> },
    { key: "side", header: "Side", width: "5rem", render: (o) => <StatusBadge kind="side" value={o.side} size="xs" dot={false} /> },
    { key: "type", header: "Type", width: "6rem", render: (o) => <span className="text-fg-muted">{humanize(o.type)}</span> },
    { key: "quantity", header: "Qty", align: "right", render: (o) => formatQty(o.quantity) },
    {
      key: "filled",
      header: "Filled",
      align: "right",
      render: (o) => (o.filledQuantity > 0 ? formatQty(o.filledQuantity) : <span className="text-fg-subtle">—</span>),
    },
    { key: "estimatedNotional", header: "Notional", align: "right", render: (o) => formatMoney(o.estimatedNotional, currency, { compact: true }) },
    { key: "origin", header: "Origin", width: "6rem", render: (o) => <span className="text-fg-muted">{humanize(o.origin)}</span> },
    { key: "status", header: "Status", render: (o) => <StatusBadge kind="order" value={o.status} size="xs" /> },
    { key: "createdAt", header: "Created", align: "right", render: (o) => <span className="text-fg-subtle">{formatRelative(o.createdAt, now)}</span> },
  ];
}

export async function OrdersTab({ portfolioId, currency }: { portfolioId: string; currency: Currency }) {
  const [orders, now] = await Promise.all([loadOrders(portfolioId), loadNow()]);

  return (
    <Card>
      <Guard result={orders} what="orders">
        {(paged) => (
          <DataTable
            columns={makeColumns(now, currency)}
            rows={paged.items}
            rowKey={(o) => o.id}
            rowHref={(o) => `/orders/${o.id}`}
            caption="Orders for this portfolio"
            className="max-h-[36rem]"
            emptyTitle="No orders"
            emptyDescription="Nothing has been routed for this portfolio yet."
          />
        )}
      </Guard>
    </Card>
  );
}
