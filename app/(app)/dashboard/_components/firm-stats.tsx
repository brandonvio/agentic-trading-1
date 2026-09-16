import { formatMoney, formatMultiple, formatNumber } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatTile } from "@/components/ui/stat-tile";
import { ApprovalsIcon, AgentsIcon, PositionsIcon, RiskIcon } from "@/components/icons";
import { loadAgentUsage, loadFirmRisk, loadFirmSnapshot, loadPendingApprovals } from "./data";

const DASH = "—";

/** Firm-level headline metrics. Every tile degrades to an em dash on its own. */
export async function FirmStats() {
  const [snapshot, risk, approvals, usage] = await Promise.all([
    loadFirmSnapshot(),
    loadFirmRisk(),
    loadPendingApprovals(),
    loadAgentUsage(),
  ]);

  const firm = snapshot.ok ? snapshot.value : null;
  const nav = firm?.totalNav ?? 0;
  const dayPnlPct = firm && nav !== 0 ? firm.dayPnl / nav : null;
  const unrealizedPct = firm && nav !== 0 ? firm.unrealizedPnl / nav : null;
  const criticalBreaches = risk.ok ? risk.value.criticalBreaches : 0;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
      <StatTile
        label="Total NAV"
        value={firm ? formatMoney(firm.totalNav, "USD", { compact: true }) : DASH}
        hint={firm ? `${formatNumber(firm.portfolioCount)} portfolios · ${formatMoney(firm.totalCash, "USD", { compact: true })} cash` : "No access"}
      />
      <StatTile
        label="Day P&L"
        value={firm ? formatMoney(firm.dayPnl, "USD", { compact: true, sign: true }) : DASH}
        valueTone={toneForSign(firm?.dayPnl)}
        delta={dayPnlPct}
        deltaLabel="of NAV"
      />
      <StatTile
        label="Unrealized P&L"
        value={firm ? formatMoney(firm.unrealizedPnl, "USD", { compact: true, sign: true }) : DASH}
        valueTone={toneForSign(firm?.unrealizedPnl)}
        delta={unrealizedPct}
        deltaLabel="of NAV"
      />
      <StatTile
        label="Gross exposure"
        value={firm ? formatMoney(firm.grossExposure, "USD", { compact: true }) : DASH}
        hint={firm ? `${formatMultiple(firm.grossLeverage)} gross leverage` : "No access"}
      />
      <StatTile
        label="Open positions"
        value={firm ? formatNumber(firm.openPositionCount) : DASH}
        hint="Across visible portfolios"
        icon={<PositionsIcon size={14} />}
        href="/positions"
      />
      <StatTile
        label="Pending approvals"
        value={approvals.ok ? formatNumber(approvals.value) : DASH}
        valueTone={approvals.ok && approvals.value > 0 ? "warning" : "neutral"}
        hint={approvals.ok && approvals.value > 0 ? "Awaiting a decision" : "Queue clear"}
        icon={<ApprovalsIcon size={14} />}
        href="/approvals"
      />
      <StatTile
        label="Open breaches"
        value={risk.ok ? formatNumber(risk.value.openBreaches) : DASH}
        valueTone={criticalBreaches > 0 ? "negative" : risk.ok && risk.value.openBreaches > 0 ? "warning" : "neutral"}
        hint={risk.ok ? `${formatNumber(criticalBreaches)} critical` : "No access"}
        icon={<RiskIcon size={14} />}
        href="/risk"
      />
      <StatTile
        label="Agent cost today"
        value={usage.ok ? formatMoney(usage.value.costUsdToday, "USD", { decimals: 2 }) : DASH}
        hint={usage.ok ? `${formatNumber(usage.value.runsToday)} runs · ${formatNumber(usage.value.successRatePct, { decimals: 0 })}% ok` : "No access"}
        icon={<AgentsIcon size={14} />}
        href="/agents"
      />
    </div>
  );
}
