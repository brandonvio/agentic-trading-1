import { formatDateTime, formatNumber, formatPct, humanize } from "@/lib/ui/format";
import { toneFor, toneForSign } from "@/lib/ui/status";
import { Badge, TONE_TEXT } from "@/components/ui/badge";
import { loadMarketOverview } from "./data";
import { Guard } from "./guard";

/** Market regime, headline and the indicator strip beneath it. */
export async function MarketRegimeStrip() {
  const overview = await loadMarketOverview();

  return (
    <section aria-label="Market regime" className="panel px-4 py-3">
      <Guard result={overview} what="market data">
        {(market) => (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Badge tone={toneFor("regime", market.regime)} dot>
                {humanize(market.regime)}
              </Badge>
              <p className="min-w-0 truncate text-xs text-fg" title={market.headline}>
                {market.headline}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {market.indicators.slice(0, 5).map((indicator) => (
                <div key={indicator.name} className="flex items-baseline gap-1.5">
                  <span className="label-caps">{indicator.name}</span>
                  <span className="num text-xs text-fg">
                    {formatNumber(indicator.value, { decimals: 2 })}
                    {indicator.unit === "%" ? "%" : indicator.unit ? ` ${indicator.unit}` : ""}
                  </span>
                  <span className={`num text-2xs ${TONE_TEXT[toneForSign(indicator.changePct)]}`}>
                    {formatPct(indicator.changePct, { sign: true, decimals: 2 })}
                  </span>
                </div>
              ))}
              <span className="num text-2xs text-fg-subtle">{formatDateTime(market.asOf)} UTC</span>
            </div>
          </div>
        )}
      </Guard>
    </section>
  );
}
