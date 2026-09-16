import { humanize } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline, type TimelineEvent } from "@/components/ui/timeline";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow } from "@/app/(app)/_lib/data";
import type { AuditAction } from "@/lib/domain/audit";
import { loadOrderAudit } from "../../_components/data";

const TONE: Partial<Record<AuditAction, Tone>> = {
  "order.created": "neutral",
  "order.risk_checked": "info",
  "order.approval_requested": "warning",
  "order.routed": "accent",
  "order.filled": "positive",
  "order.cancelled": "muted",
  "order.rejected": "negative",
  "approval.decided": "info",
};

/** Chronological audit trail for one order, oldest first. */
export async function OrderAuditTimeline({ orderId }: { orderId: string }) {
  const [audit, now] = await Promise.all([loadOrderAudit(orderId), loadNow()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="immutable">Audit trail</CardTitle>
      </CardHeader>
      <Guard result={audit} what="the audit trail">
        {(paged) => {
          const events: TimelineEvent[] = [...paged.items]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((event) => ({
              id: event.id,
              at: event.at,
              title: humanize(event.action.replace(/\./g, " ")),
              description: event.summary,
              tone: TONE[event.action] ?? "neutral",
              meta: <span className="text-2xs text-fg-subtle">{event.actor.name} · {event.actor.kind}</span>,
            }));
          return (
            <CardBody>
              <Timeline
                events={events}
                now={now}
                emptyText="No audit events recorded against this order yet."
              />
            </CardBody>
          );
        }}
      </Guard>
    </Card>
  );
}
