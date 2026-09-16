import Link from "next/link";
import { formatDateTime, formatMoney, formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { User } from "@/lib/domain/auth";
import { Guard } from "../../_components/guard";
import { loadNow, loadUserIndex } from "../../_lib/data";
import { byDecidedDesc, loadApprovals, subjectHref } from "./data";

function makeColumns(now: number, users: Map<string, User>): Column<ApprovalRequest>[] {
  return [
    { key: "status", header: "Outcome", width: "7rem", render: (a) => <StatusBadge kind="approval" value={a.status} size="xs" /> },
    {
      key: "subject",
      header: "Subject",
      render: (a) => {
        const href = subjectHref(a);
        return (
          <span className="block min-w-0">
            {href ? (
              <Link href={href} className="block truncate font-medium text-fg hover:text-accent-strong">
                {a.subjectLabel}
              </Link>
            ) : (
              <span className="block truncate font-medium text-fg">{a.subjectLabel}</span>
            )}
            <span className="block truncate text-2xs text-fg-subtle">{humanize(a.type)}</span>
          </span>
        );
      },
    },
    { key: "requester", header: "Requested by", width: "10rem", mono: false, render: (a) => <span className="truncate text-fg-muted">{a.requestedBy.name}</span> },
    { key: "notional", header: "Notional", align: "right", render: (a) => formatMoney(a.notional, "USD", { compact: true }) },
    {
      key: "decidedBy",
      header: "Decided by",
      width: "10rem",
      mono: false,
      render: (a) => (
        <span className="truncate text-fg-muted">{a.decidedByUserId ? (users.get(a.decidedByUserId)?.name ?? a.decidedByUserId) : "—"}</span>
      ),
    },
    {
      key: "note",
      header: "Note",
      mono: false,
      render: (a) =>
        a.decisionNote ? (
          <span className="block truncate text-fg-muted" title={a.decisionNote}>
            {a.decisionNote}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "decidedAt",
      header: "Decided",
      align: "right",
      width: "7rem",
      render: (a) =>
        a.decidedAt ? (
          <span className="text-fg-subtle" title={formatDateTime(a.decidedAt, { seconds: true })}>
            {formatRelative(a.decidedAt, now)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];
}

/** Everything that has left the queue: approved, rejected, expired or cancelled. */
export async function DecidedHistory() {
  const [approvals, now, users] = await Promise.all([loadApprovals(), loadNow(), loadUserIndex()]);
  const columns = makeColumns(now, users);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="most recent first">Decision history</CardTitle>
      </CardHeader>
      <Guard result={approvals} what="the approval history">
        {(paged) => {
          const rows = paged.items.filter((a) => a.status !== "pending").sort(byDecidedDesc);
          return (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(a) => a.id}
              caption="Decided approval requests"
              emptyTitle="No decisions yet"
              emptyDescription="Approved, rejected, expired and cancelled requests are kept here for the audit trail."
              footer={rows.length > 0 ? `${rows.length} decided of ${paged.total} total requests` : undefined}
            />
          );
        }}
      </Guard>
    </Card>
  );
}
