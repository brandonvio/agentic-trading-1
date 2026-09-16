import { formatNumber, formatPct, formatSymbol, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { AssetClass, BrokerKey, Instrument, Quote } from "@/lib/domain/instrument";
import { Guard } from "@/app/(app)/_components/guard";
import { INSTRUMENT_LIMIT, loadInstruments, loadQuotes } from "./data";

interface Row {
  instrument: Instrument;
  quote: Quote | null;
}

const DASH = <span className="text-fg-subtle">—</span>;

/** Price precision from the instrument's tick size: 0.0001 → 4 decimals. */
function priceDecimals(tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) return 2;
  return Math.min(6, Math.max(2, Math.ceil(-Math.log10(tickSize))));
}

function price(value: number | null | undefined, instrument: Instrument) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return formatNumber(value, { decimals: priceDecimals(instrument.tickSize) });
}

const columns: Column<Row>[] = [
  {
    key: "symbol",
    header: "Symbol",
    width: "12rem",
    mono: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{formatSymbol(row.instrument.symbol)}</span>
        <span className="block truncate font-sans text-2xs text-fg-subtle" title={row.instrument.name}>
          {row.instrument.name}
        </span>
      </span>
    ),
  },
  {
    key: "assetClass",
    header: "Class",
    width: "6rem",
    render: (row) => (
      <Badge tone="muted" size="xs" dot={false}>
        {humanize(row.instrument.assetClass)}
      </Badge>
    ),
  },
  {
    key: "venue",
    header: "Venue",
    render: (row) => (
      <span className="block min-w-0">
        <span className="block truncate text-fg-muted">{row.instrument.venue}</span>
        <span className="block truncate text-2xs text-fg-subtle">{row.instrument.broker.toUpperCase()}</span>
      </span>
    ),
  },
  { key: "bid", header: "Bid", align: "right", render: (row) => price(row.quote?.bid, row.instrument) },
  { key: "ask", header: "Ask", align: "right", render: (row) => price(row.quote?.ask, row.instrument) },
  { key: "last", header: "Last", align: "right", render: (row) => <span className="text-fg">{price(row.quote?.last, row.instrument)}</span> },
  {
    key: "changePct",
    header: "Change",
    align: "right",
    render: (row) =>
      row.quote ? <span className={TONE_TEXT[toneForSign(row.quote.changePct)]}>{formatPct(row.quote.changePct, { sign: true })}</span> : DASH,
  },
  {
    key: "spread",
    header: "Spread",
    align: "right",
    render: (row) => (row.quote ? price(row.quote.ask - row.quote.bid, row.instrument) : DASH),
  },
  {
    key: "volume",
    header: "Volume",
    align: "right",
    render: (row) => (row.quote ? formatNumber(row.quote.volume, { compact: true }) : DASH),
  },
  {
    key: "impliedVol",
    header: "IV",
    align: "right",
    render: (row) => (row.quote?.impliedVol != null ? formatPct(row.quote.impliedVol) : DASH),
  },
  {
    key: "tradable",
    header: "Status",
    align: "right",
    render: (row) => (
      <Badge tone={row.instrument.tradable ? "positive" : "muted"} size="xs">
        {row.instrument.tradable ? "Tradable" : "Halted"}
      </Badge>
    ),
  },
];

export interface InstrumentsTableProps {
  assetClass?: AssetClass;
  broker?: BrokerKey;
  search?: string;
}

/**
 * Instrument browser joined with live-ish quotes. A quote failure (or a role
 * without market data) leaves the price cells dashed rather than failing the
 * whole table.
 */
export async function InstrumentsTable({ assetClass, broker, search }: InstrumentsTableProps) {
  const instruments = await loadInstruments(assetClass, broker, search);
  const ids = instruments.ok ? instruments.value.items.map((i) => i.id) : [];
  const quotes = await loadQuotes(ids.join(","));
  const quoteById = new Map<string, Quote>(quotes.ok ? quotes.value.map((q) => [q.instrumentId, q]) : []);

  return (
    <Card>
      <CardHeader
        actions={
          instruments.ok ? (
            <span className="num text-2xs text-fg-subtle">
              {formatNumber(instruments.value.items.length)} of {formatNumber(instruments.value.total)}
            </span>
          ) : null
        }
      >
        <CardTitle hint={quotes.ok ? "bid / ask / last" : "quotes unavailable"}>Instruments</CardTitle>
      </CardHeader>
      <Guard result={instruments} what="market data">
        {(paged) => (
          <DataTable
            columns={columns}
            rows={paged.items.map((instrument) => ({ instrument, quote: quoteById.get(instrument.id) ?? null }))}
            rowKey={(row) => row.instrument.id}
            caption="Instrument universe with current quotes"
            className="max-h-[38rem]"
            emptyTitle={search ? `No instrument matches “${search}”` : "No instruments"}
            emptyDescription={
              search
                ? "Try a different symbol or clear the filters."
                : "No instrument is visible to your role, or the platform has not been seeded yet."
            }
            footer={
              paged.total > paged.items.length
                ? `Showing the first ${formatNumber(INSTRUMENT_LIMIT)} of ${formatNumber(paged.total)} instruments — narrow the search to see more.`
                : undefined
            }
          />
        )}
      </Guard>
    </Card>
  );
}
