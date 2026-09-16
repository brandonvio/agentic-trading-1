import Link from "next/link";
import { formatDateTime, formatMoney, formatRelative, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { Portfolio } from "@/lib/domain/portfolio";
import { Guard } from "../../_components/guard";
import { loadNow, loadPortfolioIndex } from "../../_lib/data";
import { byOldest, loadApprovals, subjectHref } from "./data";
import { DecideControls, DecideNotice } from "./decide-controls";

function SubjectCell({ approval }: { approval: ApprovalRequest }) {
  const href = subjectHref(approval);
  return (
    <span className="block min-w-0">
      {href ? (
        <Link href={href} className="block truncate font-medium text-fg hover:text-accent-strong">
          {approval.subjectLabel}
        </Link>
      ) : (
        <span className="block truncate font-medium text-fg">{approval.subjectLabel}</span>
      )}
      <span className="block truncate text-2xs text-fg-subtle">{humanize(approval.type)}</span>
    </span>
  );
}

function RequesterCell({ approval }: { approval: ApprovalRequest }) {
  const actor = approval.requestedBy;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {actor.kind === "agent" ? (
        <Badge tone="accent" size="xs" dot={false}>
          Agent
        </Badge>
      ) : null}
      <span className="truncate text-fg-muted">{actor.name}</span>
    </span>
  );
}

function makeColumns(now: number, portfolios: Map<string, Portfolio>): Column<ApprovalRequest>[] {
  return [
    { key: "subject", header: "Subject", render: (a) => <SubjectCell approval={a} /> },
    { key: "requester", header: "Requested by", width: "11rem", mono: false, render: (a) => <RequesterCell approval={a} /> },
    {
      key: "portfolio",
      header: "Portfolio",
      width: "7rem",
      render: (a) =>
        a.portfolioId ? (
          <Link href={`/portfolios/${a.portfolioId}`} className="num text-fg-muted hover:text-fg">
            {portfolios.get(a.portfolioId)?.code ?? a.portfolioId}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: "notional", header: "Notional", align: "right", render: (a) => formatMoney(a.notional, "USD", { compact: true }) },
    {
      key: "risk",
      header: "Risk summary",
      mono: false,
      render: (a) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg-muted" title={a.riskSummary || undefined}>
            {a.riskSummary || "No risk summary supplied"}
          </span>
          {a.reason ? (
            <span className="block truncate text-2xs text-fg-subtle" title={a.reason}>
              {a.reason}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      width: "7rem",
      render: (a) => {
        const expired = new Date(a.expiresAt).getTime() < now;
        return (
          <span className="block">
            <span className="block text-fg-subtle">{formatRelative(a.createdAt, now)}</span>
            <span
              className={`block text-2xs ${expired ? "text-negative" : "text-fg-subtle"}`}
              title={formatDateTime(a.expiresAt, { seconds: true })}
            >
              {expired ? "expired " : "expires "}
              {formatRelative(a.expiresAt, now)}
            </span>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Decision</span>,
      align: "right",
      width: "13rem",
      mono: false,
      render: (a) => (
        <DecideControls id={a.id} requesterUserId={a.requestedBy.kind === "user" ? a.requestedBy.id : null} subjectLabel={a.subjectLabel} />
      ),
    },
  ];
}

/** The live queue: oldest first, because that is the order it should be worked. */
export async function PendingQueue() {
  const [approvals, now, portfolios] = await Promise.all([loadApprovals(), loadNow(), loadPortfolioIndex()]);
  const columns = makeColumns(now, portfolios);

  return (
    <div className="space-y-4">
      <DecideNotice />
      <Card>
        <CardHeader>
          <CardTitle hint="oldest first">Awaiting decision</CardTitle>
        </CardHeader>
        <Guard result={approvals} what="the approval queue">
          {(paged) => {
            const rows = paged.items.filter((a) => a.status === "pending").sort(byOldest);
            return (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                caption="Pending approval requests"
                emptyTitle="Nothing awaiting approval"
                emptyDescription="Orders above the approval threshold and live strategy deployments land here for a second pair of eyes."
              />
            );
          }}
        </Guard>
      </Card>
    </div>
  );
}
