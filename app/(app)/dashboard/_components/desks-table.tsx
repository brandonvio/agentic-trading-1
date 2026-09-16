import { formatMoney, formatPct } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress-bar";
import { loadFirmSnapshot } from "./data";
import { Guard } from "./guard";

interface DeskRow {
  deskId: string;
  deskName: string;
  nav: number;
  dayPnl: number;
  shareOfNav: number;
}

export async function DesksTable() {
  const snapshot = await loadFirmSnapshot();

  const columns: Column<DeskRow>[] = [
    { key: "deskName", header: "Desk", render: (row) => <span className="font-medium text-fg">{row.deskName}</span> },
    {
      key: "shareOfNav",
      header: "Share",
      width: "9rem",
      render: (row) => <ProgressBar value={row.shareOfNav} tone="accent" size="xs" warnAt={0} showValue />,
    },
    { key: "nav", header: "NAV", align: "right", render: (row) => formatMoney(row.nav, "USD", { compact: true }) },
    {
      key: "dayPnl",
      header: "Day P&L",
      align: "right",
      render: (row) => <span className={TONE_TEXT[toneForSign(row.dayPnl)]}>{formatMoney(row.dayPnl, "USD", { compact: true, sign: true })}</span>,
    },
    {
      key: "dayPnlPct",
      header: "Day %",
      align: "right",
      render: (row) => (
        <span className={TONE_TEXT[toneForSign(row.dayPnl)]}>{row.nav ? formatPct(row.dayPnl / row.nav, { sign: true }) : "—"}</span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="by NAV">Desks</CardTitle>
      </CardHeader>
      <Guard result={snapshot} what="desk performance">
        {(firm) => {
          const total = firm.exposureByDesk.reduce((sum, desk) => sum + Math.abs(desk.nav), 0);
          const rows: DeskRow[] = [...firm.exposureByDesk]
            .sort((a, b) => b.nav - a.nav)
            .map((desk) => ({ ...desk, shareOfNav: total > 0 ? Math.abs(desk.nav) / total : 0 }));
          return (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.deskId}
              caption="Desks by net asset value"
              emptyTitle="No desks"
              emptyDescription="No desk is visible to your role yet."
            />
          );
        }}
      </Guard>
    </Card>
  );
}
