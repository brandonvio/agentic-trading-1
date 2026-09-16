import { formatMoney, formatPct, formatRelative, formatSymbol } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Signal } from "@/lib/domain/agent";
import { loadNow, loadLatestSignals } from "./data";
import { Guard } from "./guard";

function makeColumns(now: number): Column<Signal>[] {
  return [
    {
      key: "symbol",
      header: "Instrument",
      mono: true,
      render: (signal) => <span className="font-medium text-fg">{formatSymbol(signal.symbol)}</span>,
    },
    {
      key: "direction",
      header: "Dir",
      width: "5.5rem",
      render: (signal) => <StatusBadge kind="direction" value={signal.direction} size="xs" dot={false} />,
    },
    {
      key: "conviction",
      header: "Conviction",
      width: "9rem",
      render: (signal) => <ProgressBar value={signal.conviction} tone="accent" size="xs" warnAt={0} showValue />,
    },
    {
      key: "expectedReturnPct",
      header: "Exp. return",
      align: "right",
      render: (signal) => (
        <span className={TONE_TEXT[toneForSign(signal.expectedReturnPct)]}>
          {formatPct(signal.expectedReturnPct, { sign: true })}
        </span>
      ),
    },
    {
      key: "suggestedNotional",
      header: "Notional",
      align: "right",
      render: (signal) => formatMoney(signal.suggestedNotional, "USD", { compact: true }),
    },
    {
      key: "createdAt",
      header: "Age",
      align: "right",
      render: (signal) => <span className="text-fg-subtle">{formatRelative(signal.createdAt, now)}</span>,
    },
  ];
}

export async function LatestSignals() {
  const [signals, now] = await Promise.all([loadLatestSignals(), loadNow()]);
  const columns = makeColumns(now);

  return (
    <Card>
      <CardHeader actions={<ButtonLink href="/signals" size="xs" variant="ghost">All signals</ButtonLink>}>
        <CardTitle hint="new, unacted">Signals</CardTitle>
      </CardHeader>
      <Guard result={signals} what="agent signals">
        {(paged) => (
          <DataTable
            columns={columns}
            rows={paged.items}
            rowKey={(signal) => signal.id}
            rowHref={(signal) => `/signals/${signal.id}`}
            caption="Latest unacted signals"
            emptyTitle="No new signals"
            emptyDescription="Signal-generation agents have not produced any unacted ideas."
          />
        )}
      </Guard>
    </Card>
  );
}
