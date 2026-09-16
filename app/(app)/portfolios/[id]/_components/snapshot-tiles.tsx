import { formatMoney, formatMultiple, formatNumber, formatPct } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, NotPermitted } from "@/components/ui/empty-state";
import { isForbidden } from "@/lib/ui/safe";
import type { Currency } from "@/lib/domain/common";
import { loadSnapshot } from "./data";

/** Headline metrics for one portfolio, computed from live positions. */
export async function SnapshotTiles({ portfolioId, currency }: { portfolioId: string; currency: Currency }) {
  const result = await loadSnapshot(portfolioId);
  if (!result.ok) {
    return isForbidden(result) ? (
      <NotPermitted what="this portfolio's valuation" />
    ) : (
      <EmptyState compact tone="negative" title="Snapshot unavailable" description={result.error.message} />
    );
  }
  const s = result.value;
  const money = (v: number, sign = false) => formatMoney(v, currency, { compact: true, sign });

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
      <StatTile label="NAV" value={money(s.nav)} hint={`${money(s.cash)} cash`} />
      <StatTile
        label="Day P&L"
        value={money(s.dayPnl, true)}
        valueTone={toneForSign(s.dayPnl)}
        delta={s.nav ? s.dayPnl / s.nav : null}
        deltaLabel="of NAV"
      />
      <StatTile label="Unrealized P&L" value={money(s.unrealizedPnl, true)} valueTone={toneForSign(s.unrealizedPnl)} hint={`${money(s.realizedPnl, true)} realized`} />
      <StatTile label="Gross exposure" value={money(s.grossExposure)} hint={`${formatMultiple(s.grossLeverage)} leverage`} />
      <StatTile label="Net exposure" value={money(s.netExposure, true)} valueTone={toneForSign(s.netExposure)} hint={s.nav ? `${formatPct(s.netExposure / s.nav)} of NAV` : undefined} />
      <StatTile label="Positions" value={formatNumber(s.positionCount)} hint="Open" />
      <StatTile
        label="Inception return"
        value={formatPct(s.inceptionReturnPct, { sign: true })}
        valueTone={toneForSign(s.inceptionReturnPct)}
        hint="Since funding"
      />
      <StatTile
        label="Top concentration"
        value={s.topConcentration ? formatPct(s.topConcentration.pctOfNav) : "—"}
        hint={s.topConcentration ? s.topConcentration.symbol : "No open positions"}
      />
    </div>
  );
}

export function SnapshotTilesFallback() {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="panel space-y-3 px-4 py-3">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}
