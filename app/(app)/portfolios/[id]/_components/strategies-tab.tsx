import { formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Strategy } from "@/lib/domain/strategy";
import type { Currency } from "@/lib/domain/common";
import { loadNow } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { loadStrategies } from "./data";

interface Row {
  strategy: Strategy;
  allocatedCapital: number | null;
  deployedAt: string | null;
}

function makeColumns(now: number, currency: Currency): Column<Row>[] {
  return [
    { key: "code", header: "Code", width: "8rem", mono: true, render: (r) => <span className="font-medium text-fg">{r.strategy.code}</span> },
    { key: "name", header: "Strategy", render: (r) => <span className="truncate text-fg">{r.strategy.name}</span> },
    { key: "style", header: "Style", render: (r) => <span className="text-fg-muted">{humanize(r.strategy.style)}</span> },
    { key: "status", header: "Status", width: "7rem", render: (r) => <StatusBadge kind="strategy" value={r.strategy.status} size="xs" /> },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      render: (r) => (r.allocatedCapital === null ? <span className="text-fg-subtle">—</span> : formatMoney(r.allocatedCapital, currency, { compact: true })),
    },
    {
      key: "sharpe",
      header: "Sharpe",
      align: "right",
      render: (r) => formatNumber(r.strategy.live?.sharpe ?? r.strategy.backtest?.sharpe ?? null, { decimals: 2 }),
    },
    {
      key: "deployedAt",
      header: "Deployed",
      align: "right",
      render: (r) => <span className="text-fg-subtle">{r.deployedAt ? formatRelative(r.deployedAt, now) : "—"}</span>,
    },
  ];
}

export async function StrategiesTab({ portfolioId, currency }: { portfolioId: string; currency: Currency }) {
  const [strategies, now] = await Promise.all([loadStrategies(portfolioId), loadNow()]);

  return (
    <Card>
      <Guard result={strategies} what="strategies">
        {(paged) => {
          const rows: Row[] = paged.items.map((strategy) => {
            const deployment = strategy.deployments.find((d) => d.portfolioId === portfolioId) ?? null;
            return { strategy, allocatedCapital: deployment?.allocatedCapital ?? null, deployedAt: deployment?.deployedAt ?? null };
          });
          return (
            <DataTable
              columns={makeColumns(now, currency)}
              rows={rows}
              rowKey={(r) => r.strategy.id}
              rowHref={(r) => `/strategies/${r.strategy.id}`}
              caption="Strategies deployed to this portfolio"
              emptyTitle="No strategies deployed"
              emptyDescription="No strategy allocates capital to this portfolio yet."
            />
          );
        }}
      </Guard>
    </Card>
  );
}
