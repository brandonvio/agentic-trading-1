import { formatNumber } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Order, RiskCheckResult } from "@/lib/domain/order";

const columns: Column<RiskCheckResult>[] = [
  {
    key: "rule",
    header: "Rule",
    render: (check) => (
      <span className="block min-w-0">
        <span className="block truncate text-fg">{check.rule}</span>
        <span className="block truncate text-2xs text-fg-subtle" title={check.message}>
          {check.message}
        </span>
      </span>
    ),
  },
  {
    key: "observed",
    header: "Observed",
    align: "right",
    render: (check) => (check.observed === null ? <span className="text-fg-subtle">—</span> : formatNumber(check.observed, { compact: true, decimals: 2 })),
  },
  {
    key: "limit",
    header: "Limit",
    align: "right",
    render: (check) => (check.limit === null ? <span className="text-fg-subtle">—</span> : formatNumber(check.limit, { compact: true, decimals: 2 })),
  },
  {
    key: "passed",
    header: "Result",
    align: "right",
    width: "6rem",
    render: (check) => (
      <Badge tone={check.passed ? "positive" : "negative"} size="xs" dot>
        {check.passed ? "Pass" : "Fail"}
      </Badge>
    ),
  },
];

/** Pre-trade risk evaluation recorded on the order at submission time. */
export function OrderRiskChecks({ order }: { order: Order }) {
  const failed = order.riskChecks.filter((c) => !c.passed).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle hint="pre-trade">Risk checks</CardTitle>
        {order.riskChecks.length > 0 ? (
          <Badge tone={failed > 0 ? "negative" : "positive"} size="xs" dot>
            {failed > 0 ? `${failed} failed` : "All passed"}
          </Badge>
        ) : null}
      </CardHeader>
      <DataTable
        columns={columns}
        rows={order.riskChecks}
        rowKey={(check, i) => `${check.rule}-${i}`}
        caption="Pre-trade risk checks"
        emptyTitle="No risk checks recorded"
        emptyDescription="This order has not been through pre-trade risk evaluation."
      />
    </Card>
  );
}
