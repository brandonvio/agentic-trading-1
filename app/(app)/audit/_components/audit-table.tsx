"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { AuditEvent } from "@/lib/domain/audit";
import { targetHref, toneForAction } from "./format";
import { EventDrawer } from "./event-drawer";

export interface AuditTableProps {
  events: AuditEvent[];
  total: number;
  now: number;
  /** Portfolio id → code, for the portfolio column. */
  portfolioCodes: Record<string, string>;
  filtered: boolean;
}

function makeColumns(
  now: number,
  portfolioCodes: Record<string, string>,
  onSelect: (event: AuditEvent) => void,
): Column<AuditEvent>[] {
  return [
    {
      key: "at",
      header: "Time",
      width: "11rem",
      mono: true,
      render: (e) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{formatDateTime(e.at, { seconds: true })}</span>
          <span className="block truncate text-2xs text-fg-subtle">{formatRelative(e.at, now)}</span>
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "13rem",
      render: (e) => (
        <Badge tone={toneForAction(e.action)} size="xs" mono dot>
          {e.action}
        </Badge>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (e) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{e.actor.name}</span>
          <span className="block truncate text-2xs text-fg-subtle">{humanize(e.actor.kind)}</span>
        </span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (e) => {
        const href = targetHref(e.targetType, e.targetId);
        return (
          <span className="block min-w-0">
            <span className="block truncate text-fg-muted">{e.targetType}</span>
            {href ? (
              <Link href={href} className="num block truncate text-2xs text-accent-strong hover:underline">
                {e.targetId}
              </Link>
            ) : (
              <span className="num block truncate text-2xs text-fg-subtle">{e.targetId}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "portfolio",
      header: "Portfolio",
      width: "7rem",
      mono: true,
      render: (e) =>
        e.portfolioId ? (
          <Link href={`/portfolios/${e.portfolioId}`} className="text-accent-strong hover:underline">
            {portfolioCodes[e.portfolioId] ?? e.portfolioId}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "summary",
      header: "Summary",
      className: "max-w-0",
      render: (e) => (
        <span className="block truncate text-fg-muted" title={e.summary}>
          {e.summary}
        </span>
      ),
    },
    { key: "ip", header: "IP", width: "8rem", mono: true, render: (e) => e.ip ?? <span className="text-fg-subtle">—</span> },
    {
      key: "details",
      header: <span className="sr-only">Details</span>,
      align: "right",
      width: "5rem",
      render: (e) => (
        <Button size="xs" variant="ghost" onClick={() => onSelect(e)} aria-label={`Details for ${e.action} at ${formatDateTime(e.at)}`}>
          Details
        </Button>
      ),
    },
  ];
}

/** Dense audit log with a details drawer per event. */
export function AuditTable({ events, total, now, portfolioCodes, filtered }: AuditTableProps) {
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  return (
    <Card>
      <CardHeader
        actions={
          <span className="num text-2xs text-fg-subtle">
            {formatNumber(events.length)} of {formatNumber(total)}
          </span>
        }
      >
        <CardTitle hint={filtered ? "filtered" : "most recent first"}>Audit log</CardTitle>
      </CardHeader>
      <DataTable
        columns={makeColumns(now, portfolioCodes, setSelected)}
        rows={events}
        rowKey={(e) => e.id}
        caption="Audit events"
        className="max-h-[42rem]"
        emptyTitle={filtered ? "No events match these filters" : "No audit events"}
        emptyDescription={
          filtered
            ? "Widen the date range or clear the filters to see more of the trail."
            : "Nothing has been recorded yet, or the platform has not been seeded."
        }
        footer={total > events.length ? `Showing the ${formatNumber(events.length)} most recent of ${formatNumber(total)} events.` : undefined}
      />
      <EventDrawer
        event={selected}
        now={now}
        portfolioCode={selected?.portfolioId ? portfolioCodes[selected.portfolioId] : undefined}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
}
