import { formatNumber, formatPct } from "@/lib/ui/format";
import { StatTile } from "@/components/ui/stat-tile";
import { AlertIcon, PortfolioIcon, RiskIcon } from "@/components/icons";
import type { RiskReport } from "@/lib/domain/risk";
import { loadPortfolioIndex } from "../../_lib/data";
import { Guard } from "../../_components/guard";
import { loadFirmRisk } from "./data";

const DASH = "—";

/** NAV-weighted mean of a per-portfolio fraction. */
function weighted(reports: RiskReport[], pick: (r: RiskReport) => number): number | null {
  const nav = reports.reduce((s, r) => s + (Number.isFinite(r.nav) ? r.nav : 0), 0);
  if (nav <= 0) return null;
  const total = reports.reduce((s, r) => s + (Number.isFinite(pick(r)) ? pick(r) * r.nav : 0), 0);
  return total / nav;
}

/** Firm-wide risk headline. Every tile degrades to an em dash on its own. */
export async function FirmRiskStats() {
  const [risk, portfolios] = await Promise.all([loadFirmRisk(), loadPortfolioIndex()]);

  return (
    <Guard result={risk} what="firm risk">
      {(firm) => {
        const reports = firm.portfolios;
        const gross = weighted(reports, (r) => r.grossExposurePctNav);
        const net = weighted(reports, (r) => r.netExposurePctNav);
        const var95 = weighted(reports, (r) => r.var95PctNav);

        let worst: { utilization: number; name: string; portfolio: string } | null = null;
        for (const report of reports) {
          for (const entry of report.limits) {
            if (!Number.isFinite(entry.utilizationPct)) continue;
            if (!worst || entry.utilizationPct > worst.utilization) {
              worst = {
                utilization: entry.utilizationPct,
                name: entry.limit.name,
                portfolio: portfolios.get(report.portfolioId)?.code ?? report.portfolioId,
              };
            }
          }
        }

        const deepest = reports.reduce<RiskReport | null>((b, r) => (!b || r.drawdownPct > b.drawdownPct ? r : b), null);

        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatTile
              label="Portfolios covered"
              value={formatNumber(reports.length)}
              hint="With live limit evaluation"
              icon={<PortfolioIcon size={14} />}
            />
            <StatTile
              label="Open breaches"
              value={formatNumber(firm.openBreaches)}
              valueTone={firm.openBreaches > 0 ? "warning" : "neutral"}
              hint={firm.openBreaches > 0 ? "Awaiting acknowledgement" : "All limits inside threshold"}
              icon={<AlertIcon size={14} />}
            />
            <StatTile
              label="Critical breaches"
              value={formatNumber(firm.criticalBreaches)}
              valueTone={firm.criticalBreaches > 0 ? "negative" : "neutral"}
              hint={firm.criticalBreaches > 0 ? "Escalate immediately" : "None outstanding"}
              icon={<RiskIcon size={14} />}
            />
            <StatTile
              label="Worst utilisation"
              value={worst ? formatPct(worst.utilization, { decimals: 0 }) : DASH}
              valueTone={worst && worst.utilization >= 1 ? "negative" : worst && worst.utilization >= 0.8 ? "warning" : "neutral"}
              hint={worst ? `${worst.portfolio} · ${worst.name}` : "No limits configured"}
            />
            <StatTile label="Gross exposure" value={gross === null ? DASH : formatPct(gross)} hint="NAV-weighted, % of NAV" />
            <StatTile label="Net exposure" value={net === null ? DASH : formatPct(net)} hint="NAV-weighted, absolute" />
            <StatTile label="VaR 95 (1d)" value={var95 === null ? DASH : formatPct(var95)} hint="NAV-weighted, parametric" />
            <StatTile
              label="Deepest drawdown"
              value={deepest ? formatPct(deepest.drawdownPct) : DASH}
              valueTone={deepest && deepest.drawdownPct > 0 ? "negative" : "neutral"}
              hint={deepest ? (portfolios.get(deepest.portfolioId)?.code ?? deepest.portfolioId) : "No portfolios visible"}
            />
          </div>
        );
      }}
    </Guard>
  );
}
