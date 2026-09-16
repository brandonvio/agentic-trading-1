"use client";

import { useCan } from "@/components/providers/session-provider";
import type { RiskBreachStatus } from "@/lib/domain/risk";
import { ActionButton } from "../../_components/action-button";

/**
 * Per-breach controls. Acknowledging only needs `risk:read` (anyone who can
 * see the breach may record that they have seen it); declaring it resolved is
 * gated on `risk:breaches:resolve`.
 */
export function BreachActions({ id, status }: { id: string; status: RiskBreachStatus }) {
  const canResolve = useCan("risk:breaches:resolve");

  return (
    <div className="flex items-center justify-end gap-1.5">
      <ActionButton
        path={`/api/risk/breaches/${id}/acknowledge`}
        label="Acknowledge"
        size="xs"
        variant="ghost"
        disabled={status !== "open"}
        disabledReason={status === "open" ? undefined : `Already ${status}`}
        successTitle="Breach acknowledged"
        successDescription="Recorded against your user on the breach."
      />
      <ActionButton
        path={`/api/risk/breaches/${id}/resolve`}
        label="Resolve"
        size="xs"
        disabled={!canResolve || status === "resolved"}
        disabledReason={!canResolve ? "Requires risk:breaches:resolve" : "Already resolved"}
        reasonKey="note"
        reasonLabel="Resolution note"
        reasonPlaceholder="What brought the metric back inside its limit?"
        reasonRequired={false}
        confirmTitle="Resolve breach"
        confirmDescription="Closes the breach and records the note on the audit trail."
        confirmLabel="Resolve breach"
        successTitle="Breach resolved"
      />
    </div>
  );
}
