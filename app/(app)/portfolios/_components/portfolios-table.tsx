import { formatMoney, formatMultiple, formatNumber, formatPct } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Portfolio, PortfolioSnapshot } from "@/lib/domain/portfolio";
import { loadDeskIndex } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { loadFirmSnapshot, loadPortfolios } from "./data";

interface Row {
  portfolio: Portfolio;
  deskName: string;
  snapshot: PortfolioSnapshot | null;
}

const nav = (row: Row) => row.snapshot?.nav ?? row.portfolio.nav;

const columns: Column<Row>[] = [
  { key: "code", header: "Code", width: "7rem", mono: true, render: (r) => <span className="font-medium text-fg">{r.portfolio.code}</span> },
  {
    key: "name",
    header: "Portfolio",
    render: (r) => (
      <span className="block min-w-0">
        <span className="block truncate text-fg">{r.portfolio.name}</span>
        <span className="block truncate text-2xs text-fg-subtle">{r.portfolio.description}</span>
      </span>
    ),
  },
  { key: "desk", header: "Desk", render: (r) => <span className="text-fg-muted">{r.deskName}</span> },
  { key: "nav", header: "NAV", align: "right", render: (r) => formatMoney(nav(r), r.portfolio.baseCurrency, { compact: true }) },
  {
    key: "dayPnl",
    header: "Day P&L",
    align: "right",
    render: (r) =>
      r.snapshot ? (
        <span className={TONE_TEXT[toneForSign(r.snapshot.dayPnl)]}>{formatMoney(r.snapshot.dayPnl, r.portfolio.baseCurrency, { compact: true, sign: true })}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  {
    key: "dayPnlPct",
    header: "Day %",
    align: "right",
    render: (r) =>
      r.snapshot && r.snapshot.nav ? (
        <span className={TONE_TEXT[toneForSign(r.snapshot.dayPnl)]}>{formatPct(r.snapshot.dayPnl / r.snapshot.nav, { sign: true })}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  { key: "leverage", header: "Lev", align: "right", render: (r) => formatMultiple(r.snapshot?.grossLeverage ?? null) },
  { key: "positions", header: "Pos", align: "right", render: (r) => formatNumber(r.snapshot?.positionCount ?? null) },
  { key: "status", header: "Status", align: "right", render: (r) => <StatusBadge kind="portfolio" value={r.portfolio.status} size="xs" /> },
];

export async function PortfoliosTable({ deskId, status }: { deskId?: string; status?: string }) {
  const [portfolios, snapshot, desks] = await Promise.all([loadPortfolios(deskId, status), loadFirmSnapshot(), loadDeskIndex()]);
  const snapshots = new Map<string, PortfolioSnapshot>(snapshot.ok ? snapshot.value.portfolios.map((s) => [s.portfolioId, s]) : []);
  const filtered = Boolean(deskId || status);

  return (
    <Card>
      <Guard result={portfolios} what="portfolios">
        {(paged) => {
          const rows: Row[] = paged.items
            .map((portfolio) => ({
              portfolio,
              deskName: desks.get(portfolio.deskId)?.name ?? portfolio.deskId,
              snapshot: snapshots.get(portfolio.id) ?? null,
            }))
            .sort((a, b) => nav(b) - nav(a));

          return (
            <>
              <CardHeader>
                <CardTitle hint={`${formatNumber(paged.total)} total`}>Portfolios</CardTitle>
              </CardHeader>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.portfolio.id}
                rowHref={(r) => `/portfolios/${r.portfolio.id}`}
                caption="Portfolios by net asset value"
                emptyTitle={filtered ? "No matching portfolios" : "No portfolios"}
                emptyDescription={
                  filtered
                    ? "No portfolio matches these filters. Clear them to see everything your role can access."
                    : "No portfolio is visible to your role, or the platform has not been seeded yet."
                }
              />
            </>
          );
        }}
      </Guard>
    </Card>
  );
}
