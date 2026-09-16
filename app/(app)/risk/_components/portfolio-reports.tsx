import Link from "next/link";
import { formatMoney, formatPct, humanize } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { RiskReport } from "@/lib/domain/risk";
import { DetailGrid, DetailItem } from "../../_components/detail";
import { Guard } from "../../_components/guard";
import { loadPortfolioIndex } from "../../_lib/data";
import { loadFirmRisk } from "./data";
import { formatMetricValue, formatThreshold } from "./metrics";

type LimitRow = RiskReport["limits"][number];

const STATUS_TONE: Record<LimitRow["status"], Tone> = { ok: "positive", warning: "warning", breached: "negative" };

const limitColumns: Column<LimitRow>[] = [
  {
    key: "limit",
    header: "Limit",
    render: (row) => (
      <span className="block min-w-0">
        <span className="block truncate text-fg">{row.limit.name}</span>
        <span className="block truncate text-2xs text-fg-subtle">
          {humanize(row.limit.metric)}
          {row.limit.qualifier ? ` · ${row.limit.qualifier}` : ""} · {humanize(row.limit.action)}
        </span>
      </span>
    ),
  },
  { key: "observed", header: "Observed", align: "right", render: (row) => formatMetricValue(row.limit.metric, row.observed) },
  { key: "threshold", header: "Limit", align: "right", render: (row) => formatThreshold(row.limit.metric, row.limit.threshold) },
  {
    key: "utilization",
    header: "Utilisation",
    width: "13rem",
    render: (row) => (
      <ProgressBar
        value={Number.isFinite(row.utilizationPct) ? row.utilizationPct : 1}
        label={undefined}
        warnAt={row.limit.warnThreshold !== null && row.limit.threshold !== 0 ? Math.min(0.99, Math.abs(row.limit.warnThreshold / row.limit.threshold)) : 0.8}
        showValue
      />
    ),
  },
  {
    key: "status",
    header: "Status",
    align: "right",
    width: "6rem",
    render: (row) => (
      <Badge tone={STATUS_TONE[row.status]} size="xs" dot>
        {humanize(row.status)}
      </Badge>
    ),
  },
];

function worstUtilization(report: RiskReport): number {
  return report.limits.reduce((m, l) => (Number.isFinite(l.utilizationPct) ? Math.max(m, l.utilizationPct) : Math.max(m, 1)), 0);
}

/** One card per visible portfolio: headline metrics plus limit utilisation. */
export async function PortfolioReports() {
  const [risk, portfolios] = await Promise.all([loadFirmRisk(), loadPortfolioIndex()]);

  return (
    <Guard result={risk} what="portfolio risk reports">
      {(firm) => {
        if (firm.portfolios.length === 0) {
          return (
            <EmptyState
              title="No portfolios in scope"
              description="Risk reports appear once a portfolio your role can see exists. The platform may not have been seeded yet."
            />
          );
        }
        const reports = [...firm.portfolios].sort((a, b) => worstUtilization(b) - worstUtilization(a));

        return (
          <div className="space-y-4">
            {reports.map((report) => {
              const portfolio = portfolios.get(report.portfolioId);
              const breached = report.limits.filter((l) => l.status === "breached").length;
              const warning = report.limits.filter((l) => l.status === "warning").length;
              return (
                <Card key={report.portfolioId}>
                  <CardHeader
                    actions={
                      <>
                        {breached > 0 ? (
                          <Badge tone="negative" size="xs" dot>
                            {breached} breached
                          </Badge>
                        ) : null}
                        {warning > 0 ? (
                          <Badge tone="warning" size="xs" dot>
                            {warning} near limit
                          </Badge>
                        ) : null}
                        <Link href={`/portfolios/${report.portfolioId}`} className="text-2xs text-fg-muted hover:text-fg">
                          Open portfolio
                        </Link>
                      </>
                    }
                  >
                    <CardTitle hint={portfolio?.name ?? report.portfolioId}>{portfolio?.code ?? "Portfolio"}</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <DetailGrid cols={4}>
                      <DetailItem label="NAV">{formatMoney(report.nav, portfolio?.baseCurrency ?? "USD", { compact: true })}</DetailItem>
                      <DetailItem label="Gross exposure">{formatPct(report.grossExposurePctNav)}</DetailItem>
                      <DetailItem label="Net exposure">{formatPct(report.netExposurePctNav)}</DetailItem>
                      <DetailItem label="VaR 95 (1d)">{formatPct(report.var95PctNav)}</DetailItem>
                      <DetailItem label="Day loss">
                        <span className={TONE_TEXT[report.dailyLossPctNav > 0 ? "negative" : "positive"]}>
                          {formatPct(report.dailyLossPctNav, { sign: true })}
                        </span>
                      </DetailItem>
                      <DetailItem label="Drawdown">
                        <span className={TONE_TEXT[report.drawdownPct > 0 ? "negative" : "neutral"]}>{formatPct(report.drawdownPct)}</span>
                      </DetailItem>
                      <DetailItem label="Margin used">{formatPct(report.marginUtilizationPct)}</DetailItem>
                      <DetailItem label="Largest position">
                        {report.largestPosition ? `${report.largestPosition.symbol} · ${formatPct(report.largestPosition.pctNav)}` : "—"}
                      </DetailItem>
                    </DetailGrid>
                  </CardBody>
                  <DataTable
                    columns={limitColumns}
                    rows={report.limits}
                    rowKey={(row) => row.limit.id}
                    caption={`Limit utilisation for ${portfolio?.code ?? report.portfolioId}`}
                    className="border-t border-edge"
                    emptyTitle="No limits apply"
                    emptyDescription="No platform, desk or portfolio limit covers this portfolio yet."
                  />
                </Card>
              );
            })}
          </div>
        );
      }}
    </Guard>
  );
}
