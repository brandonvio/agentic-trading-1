import { formatDateTime, formatMoney, formatNumber, formatRelative } from "@/lib/ui/format";
import { StatTile } from "@/components/ui/stat-tile";
import { ApprovalsIcon, ClockIcon } from "@/components/icons";
import { Guard } from "../../_components/guard";
import { loadNow } from "../../_lib/data";
import { loadApprovals } from "./data";

const DASH = "—";

/** Queue headline: how much is waiting, how long it has waited, what moved today. */
export async function ApprovalStats() {
  const [approvals, now] = await Promise.all([loadApprovals(), loadNow()]);

  return (
    <Guard result={approvals} what="approvals">
      {(paged) => {
        const pending = paged.items.filter((a) => a.status === "pending");
        const notional = pending.reduce((s, a) => s + (Number.isFinite(a.notional) ? a.notional : 0), 0);
        const oldest = pending.reduce<(typeof pending)[number] | null>((b, a) => (!b || a.createdAt < b.createdAt ? a : b), null);
        const today = formatDateTime(new Date(now), { style: "date" });
        const decidedToday = paged.items.filter((a) => a.decidedAt !== null && formatDateTime(a.decidedAt, { style: "date" }) === today).length;

        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Pending"
              value={formatNumber(pending.length)}
              valueTone={pending.length > 0 ? "warning" : "neutral"}
              hint={pending.length > 0 ? "Awaiting a decision" : "Queue is clear"}
              icon={<ApprovalsIcon size={14} />}
            />
            <StatTile label="Pending notional" value={pending.length > 0 ? formatMoney(notional, "USD", { compact: true }) : DASH} hint="At stake in the queue" />
            <StatTile
              label="Oldest pending"
              value={oldest ? formatRelative(oldest.createdAt, now) : DASH}
              valueTone={oldest ? "warning" : "neutral"}
              hint={oldest ? oldest.subjectLabel : "Nothing waiting"}
              icon={<ClockIcon size={14} />}
            />
            <StatTile label="Decided today" value={formatNumber(decidedToday)} hint={`${today} UTC`} />
          </div>
        );
      }}
    </Guard>
  );
}
