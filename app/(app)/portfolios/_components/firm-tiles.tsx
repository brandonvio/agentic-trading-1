import { formatMoney, formatMultiple, formatNumber } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { PortfolioIcon } from "@/components/icons";
import { loadFirmSnapshot } from "./data";

const DASH = "—";

/** Firm roll-up across every portfolio the role can see. */
export async function FirmTiles() {
  const snapshot = await loadFirmSnapshot();
  const firm = snapshot.ok ? snapshot.value : null;
  const dayPnlPct = firm && firm.totalNav !== 0 ? firm.dayPnl / firm.totalNav : null;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <StatTile
        label="Total NAV"
        value={firm ? formatMoney(firm.totalNav, "USD", { compact: true }) : DASH}
        hint={firm ? `${formatMoney(firm.totalCash, "USD", { compact: true })} cash` : "Not permitted"}
      />
      <StatTile
        label="Day P&L"
        value={firm ? formatMoney(firm.dayPnl, "USD", { compact: true, sign: true }) : DASH}
        valueTone={toneForSign(firm?.dayPnl)}
        delta={dayPnlPct}
        deltaLabel="of NAV"
      />
      <StatTile
        label="Gross exposure"
        value={firm ? formatMoney(firm.grossExposure, "USD", { compact: true }) : DASH}
        hint={firm ? `${formatMultiple(firm.grossLeverage)} gross leverage` : "Not permitted"}
      />
      <StatTile
        label="Portfolios"
        value={firm ? formatNumber(firm.portfolioCount) : DASH}
        hint={firm ? `${formatNumber(firm.openPositionCount)} open positions` : "Not permitted"}
        icon={<PortfolioIcon size={14} />}
      />
    </div>
  );
}

export function FirmTilesFallback() {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="panel space-y-3 px-4 py-3">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}
