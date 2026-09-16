"use client";

import { useCan } from "@/components/providers/session-provider";
import { ActionButton } from "@/app/(app)/_components/action-button";
import type { ButtonSize } from "@/components/ui/button";

/**
 * Cancel action for a working order. Rendered disabled with an explanatory
 * title when the role lacks `orders:cancel`, so the capability is visible
 * rather than silently missing.
 */
export function CancelOrderButton({ orderId, symbol, size = "xs" }: { orderId: string; symbol: string; size?: ButtonSize }) {
  const canCancel = useCan("orders:cancel");
  return (
    <ActionButton
      path={`/api/orders/${orderId}/cancel`}
      label="Cancel"
      variant="danger"
      size={size}
      disabled={!canCancel}
      disabledReason="Your role does not grant orders:cancel."
      reasonKey="reason"
      reasonLabel="Cancellation reason"
      reasonPlaceholder="Why is this order being cancelled?"
      confirmTitle={`Cancel ${symbol} order`}
      confirmDescription="The order is pulled from the venue and the reason is written to the audit trail."
      confirmLabel="Cancel order"
      successTitle="Order cancelled"
      successDescription={`${symbol} order pulled from the venue.`}
    />
  );
}
