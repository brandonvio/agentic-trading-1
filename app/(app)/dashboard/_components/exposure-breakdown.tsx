import { formatMoney, formatPct, humanize } from "@/lib/ui/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HBar } from "@/components/ui/progress-bar";
import type { Tone } from "@/lib/ui/status";
import type { AssetClass } from "@/lib/domain/instrument";
import { loadFirmSnapshot } from "./data";
import { Guard } from "./guard";

const ASSET_TONE: Record<AssetClass, Tone> = {
  equity: "accent",
  option: "info",
  future: "warning",
  forex: "positive",
  crypto: "negative",
  event: "neutral",
};

/** Gross exposure split by asset class, drawn with CSS bars (no chart library). */
export async function ExposureBreakdown() {
  const snapshot = await loadFirmSnapshot();

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="gross, by asset class">Exposure</CardTitle>
      </CardHeader>
      <Guard result={snapshot} what="portfolio exposure">
        {(firm) => {
          const entries = Object.entries(firm.exposureByAssetClass ?? {})
            .map(([assetClass, value]) => ({ assetClass: assetClass as AssetClass, value: Number(value) || 0 }))
            .filter((entry) => entry.value !== 0)
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
          const max = entries.reduce((m, entry) => Math.max(m, Math.abs(entry.value)), 0);
          const total = entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0);

          if (entries.length === 0) {
            return (
              <div className="p-4">
                <EmptyState compact title="No exposure" description="No open positions across visible portfolios." />
              </div>
            );
          }

          return (
            <div className="space-y-2.5 p-4">
              {entries.map((entry) => (
                <HBar
                  key={entry.assetClass}
                  label={humanize(entry.assetClass)}
                  value={entry.value}
                  max={max}
                  tone={ASSET_TONE[entry.assetClass] ?? "accent"}
                  format={(v) => formatMoney(v, "USD", { compact: true })}
                />
              ))}
              <div className="grid grid-cols-[6rem_1fr_5.5rem] items-center gap-3 border-t border-edge pt-2.5 text-2xs text-fg-subtle">
                <span>Gross</span>
                <span>{firm.totalNav ? `${formatPct(total / firm.totalNav)} of NAV` : ""}</span>
                <span className="num text-right text-fg">{formatMoney(total, "USD", { compact: true })}</span>
              </div>
            </div>
          );
        }}
      </Guard>
    </Card>
  );
}
