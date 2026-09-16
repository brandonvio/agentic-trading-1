import Link from "next/link";
import { formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { RiskBreach, RiskBreachSeverity, RiskBreachStatus } from "@/lib/domain/risk";
import type { Portfolio } from "@/lib/domain/portfolio";
import { FilterBar } from "../../_components/filters";
import { Guard } from "../../_components/guard";
import { loadNow, loadPortfolioIndex } from "../../_lib/data";
import { BreachActions } from "./breach-actions";
import { loadBreaches } from "./data";
import { SEVERITY_OPTIONS, formatMetricValue, formatThreshold } from "./metrics";

const SEVERITY_RANK: Record<RiskBreachSeverity, number> = { critical: 0, warning: 1, info: 2 };

function makeColumns(now: number, portfolios: Map<string, Portfolio>): Column<RiskBreach>[] {
  return [
    {
      key: "severity",
      header: "Severity",
      width: "6.5rem",
      render: (b) => <StatusBadge kind="riskSeverity" value={b.severity} size="xs" />,
    },
    {
      key: "limit",
      header: "Limit",
      render: (b) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{b.limitName}</span>
          <span className="block truncate text-2xs text-fg-subtle">
            {humanize(b.metric)} · {humanize(b.scope)}
          </span>
        </span>
      ),
    },
    {
      key: "portfolio",
      header: "Portfolio",
      width: "8rem",
      render: (b) =>
        b.portfolioId ? (
          <Link href={`/portfolios/${b.portfolioId}`} className="num text-fg-muted hover:text-fg">
            {portfolios.get(b.portfolioId)?.code ?? b.portfolioId}
          </Link>
        ) : (
          <span className="text-fg-subtle">Firm</span>
        ),
    },
    { key: "observed", header: "Observed", align: "right", render: (b) => formatMetricValue(b.metric, b.observed) },
    { key: "threshold", header: "Limit", align: "right", render: (b) => formatThreshold(b.metric, b.threshold) },
    {
      key: "message",
      header: "Detail",
      render: (b) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg-muted" title={b.message}>
            {b.message}
          </span>
          {b.actionTaken ? (
            <span className="block truncate text-2xs text-fg-subtle" title={b.actionTaken}>
              {b.actionTaken}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "status", header: "Status", width: "7rem", render: (b) => <StatusBadge kind="riskBreach" value={b.status} size="xs" /> },
    {
      key: "detectedAt",
      header: "Detected",
      align: "right",
      width: "7rem",
      render: (b) => (
        <span className="block">
          <span className="block text-fg-subtle">{formatRelative(b.detectedAt, now)}</span>
          <span className="block truncate text-2xs text-fg-subtle">{b.detectedBy.name}</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "13rem",
      mono: false,
      render: (b) => <BreachActions id={b.id} status={b.status} />,
    },
  ];
}

export interface BreachesPanelProps {
  /** Raw `?status=` value: undefined means "open only", "all" means every status. */
  statusParam: string | undefined;
  severity: RiskBreachSeverity | undefined;
}

/** Breach queue. Defaults to open breaches; other statuses stay reviewable. */
export async function BreachesPanel({ statusParam, severity }: BreachesPanelProps) {
  const status: RiskBreachStatus | undefined = statusParam === "all" ? undefined : ((statusParam ?? "open") as RiskBreachStatus);
  const [breaches, now, portfolios] = await Promise.all([loadBreaches(status, severity), loadNow(), loadPortfolioIndex()]);
  const columns = makeColumns(now, portfolios);
  const selectValue = statusParam === "open" ? "" : (statusParam ?? "");

  return (
    <div className="space-y-4">
      <FilterBar
        basePath="/risk"
        preserve={{ tab: "breaches" }}
        filters={[
          {
            name: "status",
            label: "Status",
            value: selectValue,
            allLabel: "Open only (default)",
            options: [
              { value: "acknowledged", label: "Acknowledged" },
              { value: "resolved", label: "Resolved" },
              { value: "all", label: "All statuses" },
            ],
          },
          { name: "severity", label: "Severity", value: severity, allLabel: "All severities", options: SEVERITY_OPTIONS },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle hint={status ? `${humanize(status)} only` : "every status"}>Limit breaches</CardTitle>
        </CardHeader>
        <Guard result={breaches} what="risk breaches">
          {(paged) => {
            const rows = [...paged.items].sort(
              (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt),
            );
            return (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(b) => b.id}
                caption="Risk limit breaches"
                emptyTitle={status === "open" ? "No open breaches" : "No breaches"}
                emptyDescription={
                  status === "open"
                    ? "Every limit is inside its threshold across the portfolios your role can see."
                    : "Nothing matches this filter. Breaches are recorded automatically when a limit is exceeded."
                }
                footer={paged.total > rows.length ? `Showing ${rows.length} of ${paged.total} breaches` : undefined}
              />
            );
          }}
        </Guard>
      </Card>
    </div>
  );
}
