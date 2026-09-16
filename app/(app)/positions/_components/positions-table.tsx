import { formatMoney, formatNumber, formatPct, formatQty, formatRelative, formatSymbol, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Position, Portfolio } from "@/lib/domain/portfolio";
import type { Strategy } from "@/lib/domain/strategy";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { ClosePositionButton } from "./close-position";
import { loadPositions, loadStrategyIndex } from "./data";

interface Ctx {
  now: number;
  portfolios: Map<string, Portfolio>;
  strategies: Map<string, Strategy>;
}

const isOpen = (p: Position) => p.closedAt === null && p.quantity !== 0;

/** Cost basis is market value less the mark-to-market gain. */
function returnPct(p: Position): number | null {
  const cost = p.marketValue - p.unrealizedPnl;
  return cost === 0 ? null : p.unrealizedPnl / Math.abs(cost);
}

function makeColumns({ now, portfolios, strategies }: Ctx): Column<Position>[] {
  const ccy = (p: Position) => portfolios.get(p.portfolioId)?.baseCurrency ?? "USD";
  return [
    { key: "symbol", header: "Instrument", mono: true, render: (p) => <span className="font-medium text-fg">{formatSymbol(p.symbol)}</span> },
    { key: "assetClass", header: "Class", width: "6.5rem", render: (p) => <Badge size="xs">{humanize(p.assetClass)}</Badge> },
    {
      key: "portfolio",
      header: "Portfolio",
      mono: true,
      render: (p) => <span className="text-fg-muted">{portfolios.get(p.portfolioId)?.code ?? p.portfolioId}</span>,
    },
    {
      key: "strategy",
      header: "Strategy",
      render: (p) => <span className="text-fg-muted">{p.strategyId ? (strategies.get(p.strategyId)?.code ?? p.strategyId) : "—"}</span>,
    },
    { key: "quantity", header: "Qty", align: "right", render: (p) => <span className={TONE_TEXT[toneForSign(p.quantity)]}>{formatQty(p.quantity)}</span> },
    { key: "averagePrice", header: "Avg", align: "right", render: (p) => formatMoney(p.averagePrice, ccy(p), { decimals: 4 }) },
    { key: "markPrice", header: "Mark", align: "right", render: (p) => formatMoney(p.markPrice, ccy(p), { decimals: 4 }) },
    { key: "marketValue", header: "Market value", align: "right", render: (p) => formatMoney(p.marketValue, ccy(p), { compact: true }) },
    {
      key: "unrealizedPnl",
      header: "Unrealized",
      align: "right",
      render: (p) => <span className={TONE_TEXT[toneForSign(p.unrealizedPnl)]}>{formatMoney(p.unrealizedPnl, ccy(p), { compact: true, sign: true })}</span>,
    },
    {
      key: "returnPct",
      header: "Return",
      align: "right",
      render: (p) => {
        const r = returnPct(p);
        return r === null ? <span className="text-fg-subtle">—</span> : <span className={TONE_TEXT[toneForSign(r)]}>{formatPct(r, { sign: true })}</span>;
      },
    },
    {
      key: "realizedPnl",
      header: "Realized",
      align: "right",
      render: (p) => <span className={TONE_TEXT[toneForSign(p.realizedPnl)]}>{formatMoney(p.realizedPnl, ccy(p), { compact: true, sign: true })}</span>,
    },
    { key: "openedAt", header: "Opened", align: "right", render: (p) => <span className="text-fg-subtle">{formatRelative(p.openedAt, now)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "5.5rem",
      render: (p) => (isOpen(p) ? <ClosePositionButton positionId={p.id} symbol={p.symbol} /> : <span className="text-2xs text-fg-subtle">Closed</span>),
    },
  ];
}

export async function PositionsTable({ portfolioId, assetClass, open }: { portfolioId?: string; assetClass?: string; open?: string }) {
  const [positions, now, portfolios, strategies] = await Promise.all([
    loadPositions(portfolioId, assetClass, open),
    loadNow(),
    loadPortfolioIndex(),
    loadStrategyIndex(),
  ]);
  const filtered = Boolean(portfolioId || assetClass || open);

  return (
    <Card>
      <Guard result={positions} what="positions">
        {(paged) => (
          <>
            <CardHeader>
              <CardTitle hint={`${formatNumber(paged.total)} total`}>Positions</CardTitle>
            </CardHeader>
            <DataTable
              columns={makeColumns({ now, portfolios, strategies })}
              rows={paged.items}
              rowKey={(p) => p.id}
              rowHref={(p) => `/portfolios/${p.portfolioId}`}
              caption="Positions across visible portfolios"
              className="max-h-[calc(100vh-24rem)]"
              emptyTitle={filtered ? "No matching positions" : "No positions"}
              emptyDescription={
                filtered
                  ? "No position matches these filters. Clear them to see every position your role can access."
                  : "No portfolio visible to your role holds a position, or the platform has not been seeded yet."
              }
            />
          </>
        )}
      </Guard>
    </Card>
  );
}
