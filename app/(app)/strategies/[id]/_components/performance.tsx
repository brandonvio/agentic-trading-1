import { formatDateTime, formatMoney, formatNumber, formatPct, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Sparkline } from "@/components/ui/sparkline";
import { DetailGrid, DetailItem } from "@/app/(app)/_components/detail";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow } from "@/app/(app)/_lib/data";
import { formatRelative } from "@/lib/ui/format";
import type { Backtest, PerformanceStats } from "@/lib/domain/strategy";
import { loadBacktests } from "./data";

function StatsBlock({ label, stats }: { label: string; stats: PerformanceStats | null }) {
  if (!stats) {
    return (
      <div className="min-w-0">
        <p className="label-caps mb-2">{label}</p>
        <p className="text-xs text-fg-subtle">No {label.toLowerCase()} results recorded.</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="label-caps mb-2">{label}</p>
      <DetailGrid cols={2} className="gap-y-2">
        <DetailItem label="Sharpe">{formatNumber(stats.sharpe, { decimals: 2 })}</DetailItem>
        <DetailItem label="Sortino">{formatNumber(stats.sortino, { decimals: 2 })}</DetailItem>
        <DetailItem label="Ann. return">
          <span className={TONE_TEXT[toneForSign(stats.annualizedReturnPct)]}>{formatPct(stats.annualizedReturnPct / 100, { sign: true, decimals: 1 })}</span>
        </DetailItem>
        <DetailItem label="Max drawdown">
          <span className="text-negative">{formatPct(-Math.abs(stats.maxDrawdownPct) / 100, { decimals: 1 })}</span>
        </DetailItem>
        <DetailItem label="Win rate">{formatPct(stats.winRatePct / 100, { decimals: 1 })}</DetailItem>
        <DetailItem label="Profit factor">{formatNumber(stats.profitFactor, { decimals: 2 })}</DetailItem>
        <DetailItem label="Trades">{formatNumber(stats.tradeCount)}</DetailItem>
        <DetailItem label="As of">{formatDateTime(stats.asOf, { style: "date" })}</DetailItem>
      </DetailGrid>
    </div>
  );
}

function makeBacktestColumns(now: number): Column<Backtest>[] {
  return [
    {
      key: "window",
      header: "Window",
      render: (bt) => (
        <span className="num text-fg">
          {formatDateTime(bt.from, { style: "date" })} → {formatDateTime(bt.to, { style: "date" })}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (bt) => <Badge tone={bt.status === "completed" ? "positive" : bt.status === "failed" ? "negative" : "info"} size="xs">{humanize(bt.status)}</Badge> },
    { key: "initialCapital", header: "Capital", align: "right", render: (bt) => formatMoney(bt.initialCapital, "USD", { compact: true }) },
    { key: "sharpe", header: "Sharpe", align: "right", render: (bt) => (bt.stats ? formatNumber(bt.stats.sharpe, { decimals: 2 }) : "—") },
    {
      key: "return",
      header: "Ann. return",
      align: "right",
      render: (bt) =>
        bt.stats ? <span className={TONE_TEXT[toneForSign(bt.stats.annualizedReturnPct)]}>{formatPct(bt.stats.annualizedReturnPct / 100, { sign: true, decimals: 1 })}</span> : "—",
    },
    { key: "trades", header: "Trades", align: "right", render: (bt) => (bt.stats ? formatNumber(bt.stats.tradeCount) : "—") },
    { key: "createdAt", header: "Run", align: "right", render: (bt) => <span className="text-fg-subtle">{formatRelative(bt.createdAt, now)}</span> },
  ];
}

/** Backtest vs live statistics, the newest equity curve, and backtest history. */
export async function StrategyPerformance({ strategyId, backtest, live }: { strategyId: string; backtest: PerformanceStats | null; live: PerformanceStats | null }) {
  const [backtests, now] = await Promise.all([loadBacktests(strategyId), loadNow()]);
  const newest = backtests.ok ? backtests.value.items.find((bt) => bt.status === "completed" && bt.equityCurve.length > 1) : undefined;
  const curve = newest?.equityCurve.map(([, equity]) => equity) ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          actions={
            curve.length > 1 ? (
              <span className="flex items-center gap-2">
                <span className="label-caps">Equity curve</span>
                <Sparkline data={curve} width={160} height={32} title="Backtest equity curve" />
              </span>
            ) : null
          }
        >
          <CardTitle hint="backtest vs live">Performance</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-6 sm:grid-cols-2">
          <StatsBlock label="Backtest" stats={backtest} />
          <StatsBlock label="Live" stats={live} />
        </CardBody>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle hint="most recent first">Backtests</CardTitle>
        </CardHeader>
        <Guard result={backtests} what="backtests">
          {(paged) => (
            <DataTable
              columns={makeBacktestColumns(now)}
              rows={paged.items}
              rowKey={(bt) => bt.id}
              caption="Backtest history for this strategy"
              className="max-h-[24rem]"
              emptyTitle="No backtests"
              emptyDescription="No backtest has been run for this strategy yet."
            />
          )}
        </Guard>
      </Card>
    </div>
  );
}
