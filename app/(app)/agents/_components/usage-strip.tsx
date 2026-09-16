import { formatMoney, formatNumber, formatPct } from "@/lib/ui/format";
import { StatTile } from "@/components/ui/stat-tile";
import { AgentsIcon, BoltIcon, SignalsIcon } from "@/components/icons";
import { Guard } from "@/app/(app)/_components/guard";
import { loadAgentUsage } from "./data";

/** Firm-wide agent usage: activity, reliability and LLM spend. */
export async function AgentUsageStrip() {
  const usage = await loadAgentUsage();

  return (
    <Guard result={usage} what="agent usage statistics">
      {(stats) => {
        const signals = stats.byKind.reduce((sum, k) => sum + k.signals, 0);
        const orders = stats.byKind.reduce((sum, k) => sum + k.orders, 0);
        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Runs today" value={formatNumber(stats.runsToday)} hint={`${formatNumber(stats.runsTotal)} all time`} icon={<AgentsIcon size={14} />} />
            <StatTile
              label="Success rate"
              value={formatPct(stats.successRatePct / 100)}
              valueTone={stats.successRatePct >= 90 ? "positive" : stats.successRatePct >= 70 ? "warning" : "negative"}
              hint="Completed runs"
            />
            <StatTile label="Cost today" value={formatMoney(stats.costUsdToday, "USD", { decimals: 2 })} hint={`${formatMoney(stats.costUsdTotal, "USD", { decimals: 2 })} all time`} />
            <StatTile label="Input tokens" value={formatNumber(stats.inputTokens, { compact: true })} hint="Across all runs" icon={<BoltIcon size={14} />} />
            <StatTile label="Output tokens" value={formatNumber(stats.outputTokens, { compact: true })} hint="Across all runs" />
            <StatTile label="Produced" value={formatNumber(signals)} hint={`signals · ${formatNumber(orders)} orders`} icon={<SignalsIcon size={14} />} href="/signals" />
          </div>
        );
      }}
    </Guard>
  );
}
