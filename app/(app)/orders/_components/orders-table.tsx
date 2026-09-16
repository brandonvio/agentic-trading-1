import { formatDateTime, formatMoney, formatNumber, formatQty, formatRelative, formatSymbol, humanize } from "@/lib/ui/format";
import { toneFor } from "@/lib/ui/status";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import type { Order, OrderFilter } from "@/lib/domain/order";
import { TERMINAL_ORDER_STATUSES } from "@/lib/domain/order";
import type { Portfolio } from "@/lib/domain/portfolio";
import { loadOrders } from "./data";
import { CancelOrderButton } from "./cancel-order-button";

function priceOf(order: Order): string {
  if (order.type === "MARKET") return "MKT";
  if (order.type === "STOP") return formatNumber(order.stopPrice, { decimals: 2 });
  if (order.type === "STOP_LIMIT") return `${formatNumber(order.stopPrice, { decimals: 2 })} / ${formatNumber(order.limitPrice, { decimals: 2 })}`;
  return formatNumber(order.limitPrice, { decimals: 2 });
}

function makeColumns(now: number, portfolios: Map<string, Portfolio>): Column<Order>[] {
  return [
    {
      key: "createdAt",
      header: "Time",
      width: "6rem",
      mono: true,
      render: (order) => (
        <span title={formatDateTime(order.createdAt, { seconds: true })} className="text-fg-muted">
          {formatRelative(order.createdAt, now)}
        </span>
      ),
    },
    {
      key: "symbol",
      header: "Instrument",
      mono: true,
      render: (order) => <span className="font-medium text-fg">{formatSymbol(order.symbol)}</span>,
    },
    {
      key: "side",
      header: "Side",
      width: "4.5rem",
      render: (order) => <StatusBadge kind="side" value={order.side} size="xs" dot={false} />,
    },
    { key: "type", header: "Type", width: "6rem", render: (order) => <span className="num text-fg-muted">{order.type.replace("_", " ")}</span> },
    {
      key: "quantity",
      header: "Filled / Qty",
      align: "right",
      render: (order) => (
        <span className={order.filledQuantity > 0 && order.filledQuantity < order.quantity ? "text-info" : "text-fg"}>
          {formatQty(order.filledQuantity)} / {formatQty(order.quantity)}
        </span>
      ),
    },
    { key: "price", header: "Price", align: "right", render: (order) => <span className="text-fg-muted">{priceOf(order)}</span> },
    {
      key: "avg",
      header: "Avg fill",
      align: "right",
      render: (order) => (order.averageFillPrice === null ? <span className="text-fg-subtle">—</span> : formatNumber(order.averageFillPrice, { decimals: 2 })),
    },
    {
      key: "estimatedNotional",
      header: "Notional",
      align: "right",
      render: (order) => formatMoney(order.estimatedNotional, "USD", { compact: true }),
    },
    { key: "status", header: "Status", width: "9.5rem", render: (order) => <StatusBadge kind="order" value={order.status} size="xs" /> },
    {
      key: "origin",
      header: "Origin",
      width: "7rem",
      render: (order) => (
        <Badge tone={order.origin === "manual" ? "muted" : order.origin === "agent" ? "accent" : "info"} size="xs" dot={false} title={order.createdBy.name}>
          {humanize(order.origin)}
        </Badge>
      ),
    },
    {
      key: "createdBy",
      header: "Created by",
      render: (order) => (
        <span className="truncate text-fg-muted" title={`${order.createdBy.kind}: ${order.createdBy.name}`}>
          {order.createdBy.name}
        </span>
      ),
    },
    {
      key: "portfolio",
      header: "Portfolio",
      width: "7rem",
      mono: true,
      render: (order) => <span className="text-fg-muted">{portfolios.get(order.portfolioId)?.code ?? order.portfolioId}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "5.5rem",
      className: "relative z-[1]",
      render: (order) =>
        TERMINAL_ORDER_STATUSES.includes(order.status) ? null : <CancelOrderButton orderId={order.id} symbol={order.symbol} />,
    },
  ];
}

const TONE_HINT = (status: string | undefined) => (status ? toneFor("order", status) : "neutral");

export async function OrdersTable({ filter, filtered }: { filter: OrderFilter; filtered: boolean }) {
  const [orders, now, portfolios] = await Promise.all([loadOrders(filter), loadNow(), loadPortfolioIndex()]);
  const columns = makeColumns(now, portfolios);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint={filtered ? "filtered" : "most recent first"}>Order blotter</CardTitle>
        {orders.ok ? (
          <Badge tone={TONE_HINT(filter.status)} size="xs" dot={false} mono>
            {formatNumber(orders.value.total)}
          </Badge>
        ) : null}
      </CardHeader>
      <Guard result={orders} what="orders">
        {(paged) => (
          <DataTable
            columns={columns}
            rows={paged.items}
            rowKey={(order) => order.id}
            rowHref={(order) => `/orders/${order.id}`}
            caption="Orders"
            className="max-h-[70vh]"
            emptyTitle={filtered ? "No orders match these filters" : "No orders yet"}
            emptyDescription={
              filtered
                ? "Clear the filters to see the whole blotter."
                : "Nothing has been routed from a visible portfolio. Submit a ticket or run an agent cycle to create order flow."
            }
            footer={
              paged.total > paged.items.length
                ? `Showing ${formatNumber(paged.items.length)} of ${formatNumber(paged.total)} orders`
                : undefined
            }
          />
        )}
      </Guard>
    </Card>
  );
}
