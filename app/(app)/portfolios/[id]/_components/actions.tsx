"use client";

import { useCan } from "@/components/providers/session-provider";
import { ActionButton } from "@/app/(app)/_components/action-button";
import { BoltIcon, RefreshIcon } from "@/components/icons";

/**
 * Header actions. Both buttons stay visible without the permission so the
 * capability is discoverable, but are disabled with the reason in the tooltip.
 */
export function PortfolioActions({ portfolioId }: { portfolioId: string }) {
  const canMark = useCan("portfolios:manage");
  const canRunAgents = useCan("agents:run");

  return (
    <>
      <ActionButton
        path={`/api/portfolios/${portfolioId}/mark`}
        label="Mark to market"
        icon={<RefreshIcon size={14} />}
        disabled={!canMark}
        disabledReason="Requires the portfolios:manage permission"
        successTitle="Marked to market"
        successDescription="Positions re-priced and NAV recomputed."
      />
      <ActionButton
        path={`/api/portfolios/${portfolioId}/cycle`}
        label="Run agent cycle"
        variant="primary"
        icon={<BoltIcon size={14} />}
        disabled={!canRunAgents}
        disabledReason="Requires the agents:run permission"
        confirmTitle="Run a full agent cycle?"
        confirmDescription="Runs market intelligence, signal generation, PM sizing, execution and risk for this portfolio. Autonomous agents may originate orders inside the mandate."
        confirmLabel="Run cycle"
        successTitle="Agent cycle complete"
        successDescription="New runs, signals and orders are listed below."
      />
    </>
  );
}
