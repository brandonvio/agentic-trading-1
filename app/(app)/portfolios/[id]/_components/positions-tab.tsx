import { formatMoney, formatPct, formatQty, formatRelative, formatSymbol, humanize } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Position } from "@/lib/domain/portfolio";
import type { Currency } from "@/lib/domain/common";
import { loadNow } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { loadPositions } from "./data";

function makeColumns(now: number, currency: Currency): Column<Position>[] {
  return [
    { key: "symbol", header: "Instrument", mono: true, render: (p) => <span className="font-medium text-fg">{formatSymbol(p.symbol)}</span> },
    { key: "assetClass", header: "Class", width: "6.5rem", render: (p) => <Badge size="xs">{humanize(p.assetClass)}</Badge> },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (p) => <span className={TONE_TEXT[toneForSign(p.quantity)]}>{formatQty(p.quantity)}</span>,
    },
    { key: "averagePrice", header: "Avg", align: "right", render: (p) => formatMoney(p.averagePrice, currency, { decimals: 4 }) },
    { key: "markPrice", header: "Mark", align: "right", render: (p) => formatMoney(p.markPrice, currency, { decimals: 4 }) },
    { key: "marketValue", header: "Market value", align: "right", render: (p) => formatMoney(p.marketValue, currency, { compact: true }) },
    {
      key: "unrealizedPnl",
      header: "Unrealized",
      align: "right",
      render: (p) => <span className={TONE_TEXT[toneForSign(p.unrealizedPnl)]}>{formatMoney(p.unrealizedPnl, currency, { compact: true, sign: true })}</span>,
    },
    {
      key: "return",
      header: "Return",
      align: "right",
      render: (p) => {
        const cost = p.marketValue - p.unrealizedPnl;
        if (!cost) return <span className="text-fg-subtle">—</span>;
        return <span className={TONE_TEXT[toneForSign(p.unrealizedPnl)]}>{formatPct(p.unrealizedPnl / Math.abs(cost), { sign: true })}</span>;
      },
    },
    { key: "openedAt", header: "Opened", align: "right", render: (p) => <span className="text-fg-subtle">{formatRelative(p.openedAt, now)}</span> },
  ];
}

export async function PositionsTab({ portfolioId, currency }: { portfolioId: string; currency: Currency }) {
  const [positions, now] = await Promise.all([loadPositions(portfolioId), loadNow()]);

  return (
    <Card>
      <Guard result={positions} what="positions">
        {(paged) => (
          <DataTable
            columns={makeColumns(now, currency)}
            rows={paged.items}
            rowKey={(p) => p.id}
            rowHref={() => `/positions?portfolioId=${portfolioId}`}
            caption="Open positions in this portfolio"
            emptyTitle="No open positions"
            emptyDescription="This portfolio holds no open positions. Run an agent cycle or submit an order to build exposure."
          />
        )}
      </Guard>
    </Card>
  );
}
