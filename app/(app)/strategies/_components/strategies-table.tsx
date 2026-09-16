import { formatNumber, formatPct, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Guard } from "@/app/(app)/_components/guard";
import { loadDeskIndex } from "@/app/(app)/_lib/data";
import type { Desk } from "@/lib/domain/org";
import type { Strategy, StrategyStatus, StrategyStyle } from "@/lib/domain/strategy";
import { loadStrategies } from "./data";

function sharpeTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "muted" as const;
  return value >= 1 ? ("positive" as const) : value >= 0 ? ("neutral" as const) : ("negative" as const);
}

function makeColumns(desks: Map<string, Desk>): Column<Strategy>[] {
  return [
    { key: "code", header: "Code", width: "7rem", mono: true, render: (s) => <span className="font-medium text-fg">{s.code}</span> },
    { key: "name", header: "Strategy", render: (s) => <span className="block truncate text-fg">{s.name}</span> },
    { key: "style", header: "Style", render: (s) => <span className="text-fg-muted">{humanize(s.style)}</span> },
    {
      key: "assetClasses",
      header: "Asset classes",
      render: (s) => <span className="text-fg-muted">{s.assetClasses.map((a) => humanize(a)).join(", ")}</span>,
    },
    { key: "desk", header: "Desk", render: (s) => <span className="text-fg-muted">{desks.get(s.deskId)?.code ?? "—"}</span> },
    {
      key: "sharpe",
      header: "Sharpe (BT)",
      align: "right",
      render: (s) =>
        s.backtest ? <span className={TONE_TEXT[sharpeTone(s.backtest.sharpe)]}>{formatNumber(s.backtest.sharpe, { decimals: 2 })}</span> : <span className="text-fg-subtle">—</span>,
    },
    {
      key: "liveSharpe",
      header: "Sharpe (live)",
      align: "right",
      render: (s) =>
        s.live ? <span className={TONE_TEXT[sharpeTone(s.live.sharpe)]}>{formatNumber(s.live.sharpe, { decimals: 2 })}</span> : <span className="text-fg-subtle">—</span>,
    },
    {
      key: "annualized",
      header: "Ann. return",
      align: "right",
      render: (s) => {
        const stats = s.live ?? s.backtest;
        return stats ? (
          <span className={TONE_TEXT[toneForSign(stats.annualizedReturnPct)]}>{formatPct(stats.annualizedReturnPct / 100, { sign: true, decimals: 1 })}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        );
      },
    },
    {
      key: "maxDrawdown",
      header: "Max DD",
      align: "right",
      render: (s) => {
        const stats = s.live ?? s.backtest;
        return stats ? <span className="text-negative">{formatPct(-Math.abs(stats.maxDrawdownPct) / 100, { decimals: 1 })}</span> : <span className="text-fg-subtle">—</span>;
      },
    },
    { key: "deployments", header: "Deployed", align: "right", render: (s) => formatNumber(s.deployments.length) },
    { key: "status", header: "Status", align: "right", render: (s) => <StatusBadge kind="strategy" value={s.status} size="xs" /> },
  ];
}

export async function StrategiesTable({ status, style, deskId }: { status?: StrategyStatus; style?: StrategyStyle; deskId?: string }) {
  const [strategies, desks] = await Promise.all([loadStrategies(status, deskId), loadDeskIndex()]);
  const filtered = Boolean(status || style || deskId);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="research through live">Strategies</CardTitle>
      </CardHeader>
      <Guard result={strategies} what="strategies">
        {(paged) => {
          const rows = style ? paged.items.filter((s) => s.style === style) : paged.items;
          return (
            <DataTable
              columns={makeColumns(desks)}
              rows={rows}
              rowKey={(s) => s.id}
              rowHref={(s) => `/strategies/${s.id}`}
              caption="Strategies visible to your role"
              className="max-h-[40rem]"
              emptyTitle={filtered ? "No strategies match these filters" : "No strategies"}
              emptyDescription={
                filtered
                  ? "Clear the filters to see every strategy your role can view."
                  : "No strategy is visible to your role, or the platform has not been seeded yet."
              }
              footer={rows.length > 0 ? `${formatNumber(rows.length)} of ${formatNumber(paged.total)} strategies` : undefined}
            />
          );
        }}
      </Guard>
    </Card>
  );
}
