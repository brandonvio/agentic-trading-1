import { formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { AgentRun } from "@/lib/domain/agent";
import { loadNow, loadRecentRuns } from "./data";
import { Guard } from "./guard";

function makeColumns(now: number): Column<AgentRun>[] {
  return [
    {
      key: "status",
      header: "Status",
      width: "8.5rem",
      render: (run) => <StatusBadge kind="agentRun" value={run.status} size="xs" />,
    },
    {
      key: "agent",
      header: "Agent",
      width: "12rem",
      render: (run) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{run.agentName}</span>
          <span className="block truncate text-2xs text-fg-subtle">{humanize(run.agentKind)}</span>
        </span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      render: (run) => (
        <span className="block max-w-[28rem] truncate text-fg-muted" title={run.summary || run.objective}>
          {run.summary || run.objective || "—"}
        </span>
      ),
    },
    { key: "steps", header: "Steps", align: "right", render: (run) => formatNumber(run.stepCount) },
    { key: "cost", header: "Cost", align: "right", render: (run) => formatMoney(run.costUsd, "USD", { decimals: 3 }) },
    {
      key: "startedAt",
      header: "Started",
      align: "right",
      render: (run) => <span className="text-fg-subtle">{formatRelative(run.startedAt, now)}</span>,
    },
  ];
}

export async function RecentAgentRuns() {
  const [runs, now] = await Promise.all([loadRecentRuns(), loadNow()]);
  const columns = makeColumns(now);

  return (
    <Card>
      <CardHeader actions={<ButtonLink href="/agents" size="xs" variant="ghost">All agents</ButtonLink>}>
        <CardTitle hint="most recent first">Agent runs</CardTitle>
      </CardHeader>
      <Guard result={runs} what="agent activity">
        {(paged) => (
          <DataTable
            columns={columns}
            rows={paged.items}
            rowKey={(run) => run.id}
            rowHref={(run) => `/agents/runs/${run.id}`}
            caption="Recent agent runs"
            emptyTitle="No agent runs yet"
            emptyDescription="Trigger a portfolio cycle or run an agent to populate this feed."
          />
        )}
      </Guard>
    </Card>
  );
}
