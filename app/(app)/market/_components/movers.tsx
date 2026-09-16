import { formatDateTime, formatNumber, formatPct, formatSymbol, humanize } from "@/lib/ui/format";
import { toneForSign, type Tone } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { MarketOverview } from "@/lib/services/interfaces";
import { Guard } from "@/app/(app)/_components/guard";
import { loadMarketOverview } from "./data";

type Mover = MarketOverview["movers"][number];
type CalendarEvent = MarketOverview["eventCalendar"][number];

const IMPORTANCE_TONE: Record<CalendarEvent["importance"], Tone> = {
  low: "muted",
  medium: "info",
  high: "warning",
};

const moverColumns: Column<Mover>[] = [
  {
    key: "symbol",
    header: "Instrument",
    mono: true,
    render: (m) => <span className="font-medium text-fg">{formatSymbol(m.symbol)}</span>,
  },
  { key: "assetClass", header: "Class", render: (m) => <span className="text-fg-muted">{humanize(m.assetClass)}</span> },
  { key: "last", header: "Last", align: "right", render: (m) => formatNumber(m.last, { decimals: 2 }) },
  {
    key: "changePct",
    header: "Change",
    align: "right",
    render: (m) => <span className={TONE_TEXT[toneForSign(m.changePct)]}>{formatPct(m.changePct, { sign: true })}</span>,
  },
];

/** Biggest movers of the session, ordered by absolute move. */
export async function MoversTable() {
  const overview = await loadMarketOverview();

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="session">Movers</CardTitle>
      </CardHeader>
      <Guard result={overview} what="market data">
        {(market) => (
          <DataTable
            columns={moverColumns}
            rows={[...market.movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))}
            rowKey={(m) => m.instrumentId}
            rowHref={(m) => `/market?search=${encodeURIComponent(m.symbol)}`}
            caption="Largest movers by absolute session change"
            className="max-h-80"
            emptyTitle="No movers"
            emptyDescription="No instrument has moved enough to rank, or market data has not been seeded."
          />
        )}
      </Guard>
    </Card>
  );
}

/** Scheduled macro events, soonest first. */
export async function EventCalendar() {
  const overview = await loadMarketOverview();

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="upcoming">Event calendar</CardTitle>
      </CardHeader>
      <Guard result={overview} what="market data">
        {(market) =>
          market.eventCalendar.length === 0 ? (
            <div className="p-6">
              <EmptyState compact title="No scheduled events" description="The macro calendar is empty for the current window." />
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-edge/60 overflow-auto">
              {[...market.eventCalendar]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((event) => (
                  <li key={`${event.time}-${event.event}`} className="flex items-start justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-fg">{event.event}</p>
                      <p className="num mt-0.5 text-2xs text-fg-subtle">{formatDateTime(event.time)} UTC</p>
                    </div>
                    <Badge tone={IMPORTANCE_TONE[event.importance]} size="xs" dot={false}>
                      {humanize(event.importance)}
                    </Badge>
                  </li>
                ))}
            </ul>
          )
        }
      </Guard>
    </Card>
  );
}
