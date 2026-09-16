"use client";

import { useCan } from "@/components/providers/session-provider";
import { ActionButton } from "@/app/(app)/_components/action-button";

/**
 * Per-row close action. The wrapper is positioned so it stacks above the
 * DataTable's full-row link overlay and stays clickable.
 */
export function ClosePositionButton({ positionId, symbol }: { positionId: string; symbol: string }) {
  const canClose = useCan("positions:close");

  return (
    <span className="relative z-10 inline-flex">
      <ActionButton
        path={`/api/positions/${positionId}/close`}
        label="Close"
        size="xs"
        variant="danger"
        disabled={!canClose}
        disabledReason="Requires the positions:close permission"
        reasonKey="rationale"
        reasonLabel="Rationale"
        reasonPlaceholder={`Why are you closing ${symbol}?`}
        confirmTitle={`Close ${symbol}?`}
        confirmDescription="Submits a market order for the full remaining quantity through the normal risk and approval pipeline."
        confirmLabel="Close position"
        successTitle="Close order submitted"
        successDescription={`A flattening order for ${symbol} has been routed.`}
      />
    </span>
  );
}
