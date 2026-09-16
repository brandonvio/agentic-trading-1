import { formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { RiskBreach } from "@/lib/domain/risk";
import { loadNow, loadOpenBreaches } from "./data";
import { Guard } from "./guard";

/** Percentage-style metrics are stored as fractions; notional metrics are not. */
function formatObserved(breach: RiskBreach, value: number): string {
  if (breach.metric.endsWith("_pct_nav") || breach.metric.endsWith("_pct")) {
    return `${formatNumber(value * 100, { decimals: 1 })}%`;
  }
  return formatNumber(value, { compact: true, decimals: 2 });
}

function makeColumns(now: number): Column<RiskBreach>[] {
  return [
    {
      key: "severity",
      header: "Severity",
      width: "7rem",
      render: (breach) => <StatusBadge kind="riskSeverity" value={breach.severity} size="xs" />,
    },
    {
      key: "limitName",
      header: "Limit",
      render: (breach) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{breach.limitName}</span>
          <span className="block truncate text-2xs text-fg-subtle" title={breach.message}>
            {humanize(breach.metric)} · {humanize(breach.scope)}
          </span>
        </span>
      ),
    },
    { key: "observed", header: "Observed", align: "right", render: (breach) => formatObserved(breach, breach.observed) },
    { key: "threshold", header: "Limit", align: "right", render: (breach) => formatObserved(breach, breach.threshold) },
    {
      key: "detectedAt",
      header: "Detected",
      align: "right",
      render: (breach) => <span className="text-fg-subtle">{formatRelative(breach.detectedAt, now)}</span>,
    },
  ];
}

export async function OpenBreaches() {
  const [breaches, now] = await Promise.all([loadOpenBreaches(), loadNow()]);
  const columns = makeColumns(now);

  return (
    <Card>
      <CardHeader actions={<ButtonLink href="/risk" size="xs" variant="ghost">Risk desk</ButtonLink>}>
        <CardTitle hint="open">Risk breaches</CardTitle>
      </CardHeader>
      <Guard result={breaches} what="risk breaches">
        {(paged) => (
          <DataTable
            columns={columns}
            rows={paged.items}
            rowKey={(breach) => breach.id}
            rowHref={() => "/risk"}
            caption="Open risk breaches"
            emptyTitle="No open breaches"
            emptyDescription="Every limit is inside its threshold across visible portfolios."
          />
        )}
      </Guard>
    </Card>
  );
}
