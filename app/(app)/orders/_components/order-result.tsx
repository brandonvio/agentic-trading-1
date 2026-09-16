import Link from "next/link";
import { formatMoney, formatNumber, formatQty, formatSymbol } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { CheckIcon, CloseIcon } from "@/components/icons";
import type { Order, RiskCheckResult } from "@/lib/domain/order";

const MESSAGE: Partial<Record<Order["status"], string>> = {
  RISK_REJECTED: "Pre-trade risk blocked this order. Nothing was routed.",
  PENDING_APPROVAL: "Four-eyes approval is required before this order is routed.",
  PENDING_RISK: "The order is queued for pre-trade risk evaluation.",
  ROUTED: "The order is at the venue awaiting acknowledgement.",
  ACKNOWLEDGED: "The venue acknowledged the order.",
  PARTIALLY_FILLED: "The order is working and partially filled.",
  FILLED: "The order filled in full.",
  APPROVAL_REJECTED: "An approver rejected this order.",
  ERROR: "The broker returned an error.",
};

/** One pre-trade risk check as a pass/fail row. */
export function RiskCheckRow({ check }: { check: RiskCheckResult }) {
  return (
    <li className="flex items-start gap-2 border-b border-edge/60 py-1.5 last:border-b-0">
      <span className={check.passed ? "mt-0.5 text-positive" : "mt-0.5 text-negative"}>
        {check.passed ? <CheckIcon size={13} /> : <CloseIcon size={13} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg">{check.rule}</span>
        <span className="block text-2xs text-fg-muted">{check.message}</span>
      </span>
      {check.observed !== null || check.limit !== null ? (
        <span className="num shrink-0 text-2xs text-fg-subtle">
          {formatNumber(check.observed, { compact: true, decimals: 2 })} / {formatNumber(check.limit, { compact: true, decimals: 2 })}
        </span>
      ) : null}
    </li>
  );
}

/** Outcome panel shown in the ticket after submission. */
export function OrderResult({ order }: { order: Order }) {
  const failed = order.riskChecks.filter((c) => !c.passed);
  const checks = failed.length > 0 ? failed : order.riskChecks;
  return (
    <div className="space-y-3 rounded-md border border-edge bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-sm font-medium text-fg">
            {order.side} {formatQty(order.quantity)} {formatSymbol(order.symbol)}
          </p>
          <p className="num mt-0.5 text-2xs text-fg-subtle">
            {order.type} · {order.timeInForce} · {formatMoney(order.estimatedNotional, "USD", { compact: true })} notional
          </p>
        </div>
        <StatusBadge kind="order" value={order.status} />
      </div>

      <p className="text-xs text-fg-muted">{MESSAGE[order.status] ?? "The order was accepted."}</p>

      {order.rejectionReason ? (
        <p role="alert" className="text-xs text-negative">
          {order.rejectionReason}
        </p>
      ) : null}

      {checks.length > 0 ? (
        <div>
          <p className="label-caps mb-1">{failed.length > 0 ? "Failed risk checks" : "Pre-trade risk checks"}</p>
          <ul className="rounded-md border border-edge bg-surface-1 px-2.5">
            {checks.map((check) => (
              <RiskCheckRow key={check.rule} check={check} />
            ))}
          </ul>
        </div>
      ) : null}

      <Link href={`/orders/${order.id}`} className="inline-flex text-xs text-accent-strong hover:underline">
        Open order detail →
      </Link>
    </div>
  );
}
