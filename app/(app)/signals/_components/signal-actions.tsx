"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { useCan } from "@/components/providers/session-provider";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BoltIcon } from "@/components/icons";
import { ActionButton } from "@/app/(app)/_components/action-button";
import type { Order } from "@/lib/domain/order";

const NEGATIVE = new Set(["RISK_REJECTED", "APPROVAL_REJECTED", "ERROR", "CANCELLED"]);

/**
 * Turns a signal into an order through /api/signals/{id}/act, then opens the
 * resulting order so the trader sees its status — including a risk rejection
 * with its failed checks.
 */
export function ActSignalButton({ signalId, symbol, size = "xs" }: { signalId: string; symbol: string; size?: ButtonSize }) {
  const router = useRouter();
  const { push } = useToast();
  const canAct = useCan("orders:create");
  const [pending, setPending] = useState(false);

  async function act() {
    setPending(true);
    try {
      const order = await apiFetch<Order>(`/api/signals/${signalId}/act`, { method: "POST", body: {} });
      push({
        title: `Order ${order.status.toLowerCase().replace(/_/g, " ")}`,
        description: `${order.side} ${order.symbol} raised from this signal.`,
        tone: NEGATIVE.has(order.status) ? "negative" : order.status === "PENDING_APPROVAL" ? "warning" : "positive",
      });
      router.push(`/orders/${order.id}`);
    } catch (e) {
      push({
        title: "Could not act on signal",
        description: e instanceof ApiClientError ? e.message : "Request failed",
        tone: "negative",
      });
      setPending(false);
    }
  }

  return (
    <Button
      variant="primary"
      size={size}
      icon={<BoltIcon size={12} />}
      loading={pending}
      disabled={!canAct}
      title={canAct ? `Raise an order from the ${symbol} signal` : "Your role does not grant orders:create."}
      onClick={() => void act()}
    >
      Act
    </Button>
  );
}

/** Dismisses a signal with a recorded reason. */
export function DismissSignalButton({ signalId, symbol, size = "xs" }: { signalId: string; symbol: string; size?: ButtonSize }) {
  const canCreate = useCan("orders:create");
  const canRun = useCan("agents:run");
  const allowed = canCreate || canRun;
  return (
    <ActionButton
      path={`/api/signals/${signalId}/dismiss`}
      label="Dismiss"
      variant="ghost"
      size={size}
      disabled={!allowed}
      disabledReason="Your role does not grant orders:create or agents:run."
      reasonKey="reason"
      reasonLabel="Dismissal reason"
      reasonPlaceholder="Why is this idea not being taken?"
      confirmTitle={`Dismiss ${symbol} signal`}
      confirmDescription="The signal is closed out and the reason is written to the audit trail."
      confirmLabel="Dismiss signal"
      successTitle="Signal dismissed"
      successDescription={`${symbol} idea closed.`}
    />
  );
}
