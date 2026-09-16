import { formatDateTime, formatMoney, formatNumber, formatQty } from "@/lib/ui/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Guard } from "@/app/(app)/_components/guard";
import type { Fill } from "@/lib/domain/order";
import { loadFills } from "../../_components/data";

const columns: Column<Fill>[] = [
  {
    key: "executedAt",
    header: "Executed",
    mono: true,
    render: (fill) => <span className="text-fg-muted">{formatDateTime(fill.executedAt, { seconds: true })}</span>,
  },
  { key: "quantity", header: "Quantity", align: "right", render: (fill) => formatQty(fill.quantity) },
  { key: "price", header: "Price", align: "right", render: (fill) => formatNumber(fill.price, { decimals: 4 }) },
  {
    key: "value",
    header: "Value",
    align: "right",
    render: (fill) => formatMoney(fill.quantity * fill.price, "USD", { compact: true }),
  },
  { key: "commission", header: "Commission", align: "right", render: (fill) => formatMoney(fill.commission, "USD") },
  { key: "venue", header: "Venue", render: (fill) => <span className="text-fg-muted">{fill.venue}</span> },
  { key: "externalFillId", header: "Execution id", mono: true, render: (fill) => <span className="text-fg-subtle">{fill.externalFillId}</span> },
];

/** Executions reported by the broker for this order. */
export async function OrderFills({ orderId }: { orderId: string }) {
  const fills = await loadFills(orderId);
  return (
    <Card>
      <CardHeader>
        <CardTitle hint="from the venue">Fills</CardTitle>
      </CardHeader>
      <Guard result={fills} what="order fills">
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(fill) => fill.id}
            caption="Fills for this order"
            emptyTitle="No fills"
            emptyDescription="Nothing has executed against this order yet."
          />
        )}
      </Guard>
    </Card>
  );
}
