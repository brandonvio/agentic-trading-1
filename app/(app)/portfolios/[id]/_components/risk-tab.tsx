import { formatNumber, formatPct, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DetailGrid, DetailItem } from "@/app/(app)/_components/detail";
import { Guard } from "@/app/(app)/_components/guard";
import type { RiskMetric, RiskReport } from "@/lib/domain/risk";
import { loadRiskReport } from "./data";

type LimitRow = RiskReport["limits"][number];

const LIMIT_TONE = { ok: "positive", warning: "warning", breached: "negative" } as const;

/** Percentage metrics are fractions; notional/count metrics are not. */
export function formatMetricValue(metric: RiskMetric, value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (metric.includes("pct")) return formatPct(value, { decimals: 1 });
  if (metric === "open_orders_count") return formatNumber(Math.round(value));
  return formatNumber(value, { compact: true, decimals: 1 });
}

const columns: Column<LimitRow>[] = [
  {
    key: "name",
    header: "Limit",
    render: (r) => (
      <span className="block min-w-0">
        <span className="block truncate text-fg">{r.limit.name}</span>
        <span className="block truncate text-2xs text-fg-subtle">
          {humanize(r.limit.metric)} · {humanize(r.limit.scope)}
          {r.limit.qualifier ? ` · ${r.limit.qualifier}` : ""}
        </span>
      </span>
    ),
  },
  { key: "observed", header: "Observed", align: "right", render: (r) => formatMetricValue(r.limit.metric, r.observed) },
  { key: "threshold", header: "Limit", align: "right", render: (r) => formatMetricValue(r.limit.metric, Math.abs(r.limit.threshold)) },
  {
    key: "utilization",
    header: "Utilisation",
    width: "13rem",
    render: (r) => <ProgressBar value={Number.isFinite(r.utilizationPct) ? r.utilizationPct : 1} showValue size="sm" />,
  },
  { key: "action", header: "On breach", width: "9rem", render: (r) => <span className="text-fg-muted">{humanize(r.limit.action)}</span> },
  {
    key: "status",
    header: "Status",
    align: "right",
    render: (r) => (
      <Badge size="xs" tone={LIMIT_TONE[r.status]} dot>
        {humanize(r.status)}
      </Badge>
    ),
  },
];

export async function RiskTab({ portfolioId }: { portfolioId: string }) {
  const report = await loadRiskReport(portfolioId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle hint="computed from live positions">Risk metrics</CardTitle>
        </CardHeader>
        <Guard result={report} what="risk reporting">
          {(r) => (
            <CardBody>
              <DetailGrid cols={4}>
                <DetailItem label="Gross exposure / NAV">{formatPct(r.grossExposurePctNav, { decimals: 1 })}</DetailItem>
                <DetailItem label="Net exposure / NAV">{formatPct(r.netExposurePctNav, { decimals: 1 })}</DetailItem>
                <DetailItem label="VaR 95% / NAV">{formatPct(r.var95PctNav, { decimals: 1 })}</DetailItem>
                <DetailItem label="Margin utilisation">{formatPct(r.marginUtilizationPct, { decimals: 1 })}</DetailItem>
                <DetailItem label="Day loss / NAV">
                  <span className={TONE_TEXT[toneForSign(-r.dailyLossPctNav)]}>{formatPct(r.dailyLossPctNav, { decimals: 1, sign: true })}</span>
                </DetailItem>
                <DetailItem label="Drawdown">{formatPct(r.drawdownPct, { decimals: 1 })}</DetailItem>
                <DetailItem label="Largest position" mono={false}>
                  {r.largestPosition ? `${r.largestPosition.symbol} · ${formatPct(r.largestPosition.pctNav, { decimals: 1 })} of NAV` : "None"}
                </DetailItem>
                <DetailItem label="Limits applied">{formatNumber(r.limits.length)}</DetailItem>
              </DetailGrid>
            </CardBody>
          )}
        </Guard>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle hint="observed against threshold">Limit utilisation</CardTitle>
        </CardHeader>
        <Guard result={report} what="risk limits">
          {(r) => (
            <DataTable
              columns={columns}
              rows={[...r.limits].sort((a, b) => (b.utilizationPct || 0) - (a.utilizationPct || 0))}
              rowKey={(row) => row.limit.id}
              caption="Risk limits applying to this portfolio"
              emptyTitle="No limits apply"
              emptyDescription="No platform, desk or portfolio limit currently covers this portfolio."
            />
          )}
        </Guard>
      </Card>
    </div>
  );
}
