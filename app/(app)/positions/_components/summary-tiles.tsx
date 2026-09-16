import { formatMoney, formatNumber } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionsIcon } from "@/components/icons";
import { loadPositions } from "./data";

/** Roll-up of whatever the current filters select. */
export async function PositionSummary({ portfolioId, assetClass, open }: { portfolioId?: string; assetClass?: string; open?: string }) {
  const result = await loadPositions(portfolioId, assetClass, open);
  const items = result.ok ? result.value.items : [];
  const openItems = items.filter((p) => p.closedAt === null && p.quantity !== 0);
  const gross = openItems.reduce((sum, p) => sum + Math.abs(p.marketValue), 0);
  const unrealized = openItems.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const realized = items.reduce((sum, p) => sum + p.realizedPnl, 0);
  const denied = !result.ok;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <StatTile
        label="Open positions"
        value={denied ? "—" : formatNumber(openItems.length)}
        hint={denied ? "Not permitted" : `${formatNumber(items.length)} in view`}
        icon={<PositionsIcon size={14} />}
      />
      <StatTile label="Gross market value" value={denied ? "—" : formatMoney(gross, "USD", { compact: true })} hint="Absolute, open only" />
      <StatTile
        label="Unrealized P&L"
        value={denied ? "—" : formatMoney(unrealized, "USD", { compact: true, sign: true })}
        valueTone={toneForSign(denied ? null : unrealized)}
        hint="Open only"
      />
      <StatTile
        label="Realized P&L"
        value={denied ? "—" : formatMoney(realized, "USD", { compact: true, sign: true })}
        valueTone={toneForSign(denied ? null : realized)}
        hint="Positions in view"
      />
    </div>
  );
}

export function PositionSummaryFallback() {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="panel space-y-3 px-4 py-3">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}
