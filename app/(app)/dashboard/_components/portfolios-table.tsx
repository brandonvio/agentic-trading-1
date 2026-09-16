import { formatMoney, formatMultiple, formatNumber, formatPct } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Portfolio, PortfolioSnapshot } from "@/lib/domain/portfolio";
import { loadFirmSnapshot, loadPortfolios } from "./data";
import { Guard } from "./guard";

interface PortfolioRow {
  portfolio: Portfolio;
  deskName: string;
  snapshot: PortfolioSnapshot | null;
}

const columns: Column<PortfolioRow>[] = [
  {
    key: "code",
    header: "Code",
    width: "6rem",
    mono: true,
    render: (row) => <span className="font-medium text-fg">{row.portfolio.code}</span>,
  },
  { key: "name", header: "Portfolio", render: (row) => <span className="truncate text-fg">{row.portfolio.name}</span> },
  { key: "desk", header: "Desk", render: (row) => <span className="text-fg-muted">{row.deskName}</span> },
  {
    key: "nav",
    header: "NAV",
    align: "right",
    render: (row) => formatMoney(row.snapshot?.nav ?? row.portfolio.nav, "USD", { compact: true }),
  },
  {
    key: "dayPnl",
    header: "Day P&L",
    align: "right",
    render: (row) =>
      row.snapshot ? (
        <span className={TONE_TEXT[toneForSign(row.snapshot.dayPnl)]}>
          {formatMoney(row.snapshot.dayPnl, "USD", { compact: true, sign: true })}
        </span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  {
    key: "dayPnlPct",
    header: "Day %",
    align: "right",
    render: (row) =>
      row.snapshot && row.snapshot.nav ? (
        <span className={TONE_TEXT[toneForSign(row.snapshot.dayPnl)]}>
          {formatPct(row.snapshot.dayPnl / row.snapshot.nav, { sign: true })}
        </span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  { key: "leverage", header: "Lev", align: "right", render: (row) => formatMultiple(row.snapshot?.grossLeverage ?? null) },
  { key: "positions", header: "Pos", align: "right", render: (row) => formatNumber(row.snapshot?.positionCount ?? null) },
  {
    key: "status",
    header: "Status",
    align: "right",
    render: (row) => <StatusBadge kind="portfolio" value={row.portfolio.status} size="xs" />,
  },
];

export async function PortfoliosTable() {
  const [portfolios, snapshot] = await Promise.all([loadPortfolios(), loadFirmSnapshot()]);

  const snapshotsById = new Map<string, PortfolioSnapshot>(
    snapshot.ok ? snapshot.value.portfolios.map((s) => [s.portfolioId, s]) : [],
  );
  const deskNames = new Map<string, string>(snapshot.ok ? snapshot.value.exposureByDesk.map((d) => [d.deskId, d.deskName]) : []);

  return (
    <Card>
      <CardHeader actions={<ButtonLink href="/portfolios" size="xs" variant="ghost">All portfolios</ButtonLink>}>
        <CardTitle hint="live NAV and day P&L">Portfolios</CardTitle>
      </CardHeader>
      <Guard result={portfolios} what="portfolios">
        {(paged) => {
          const rows: PortfolioRow[] = paged.items
            .map((portfolio) => ({
              portfolio,
              deskName: deskNames.get(portfolio.deskId) ?? "—",
              snapshot: snapshotsById.get(portfolio.id) ?? null,
            }))
            .sort((a, b) => (b.snapshot?.nav ?? b.portfolio.nav) - (a.snapshot?.nav ?? a.portfolio.nav))
            .slice(0, 10);

          return (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.portfolio.id}
              rowHref={(row) => `/portfolios/${row.portfolio.id}`}
              caption="Portfolios by net asset value"
              className="max-h-[24rem]"
              emptyTitle="No portfolios"
              emptyDescription="No portfolio is visible to your role, or the platform has not been seeded yet."
              footer={paged.total > rows.length ? `Showing ${rows.length} of ${formatNumber(paged.total)} portfolios` : undefined}
            />
          );
        }}
      </Guard>
    </Card>
  );
}
