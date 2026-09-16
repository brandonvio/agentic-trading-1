import { formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow } from "@/app/(app)/_lib/data";
import { formatDuration } from "@/app/(app)/agents/_components/duration";
import type { AgentRun } from "@/lib/domain/agent";
import { loadAgentRuns } from "./data";

function makeColumns(now: number): Column<AgentRun>[] {
  return [
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (run) => <StatusBadge kind="agentRun" value={run.status} size="xs" />,
    },
    {
      key: "objective",
      header: "Objective",
      render: (run) => (
        <span className="block min-w-0">
          <span className="block truncate text-fg">{run.objective || "—"}</span>
          {run.summary ? (
            <span className="block truncate text-2xs text-fg-subtle" title={run.summary}>
              {run.summary}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "trigger", header: "Trigger", render: (run) => <span className="text-fg-muted">{humanize(run.trigger)}</span> },
    { key: "stepCount", header: "Steps", align: "right", render: (run) => formatNumber(run.stepCount) },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      render: (run) => formatNumber(run.inputTokens + run.outputTokens, { compact: true }),
    },
    { key: "costUsd", header: "Cost", align: "right", render: (run) => formatMoney(run.costUsd, "USD", { decimals: 3 }) },
    {
      key: "produced",
      header: "Output",
      align: "right",
      render: (run) => (
        <span className="text-fg-muted">
          {formatNumber(run.signalIds.length)} sig · {formatNumber(run.orderIds.length)} ord
        </span>
      ),
    },
    { key: "duration", header: "Duration", align: "right", render: (run) => formatDuration(run.startedAt, run.finishedAt) },
    {
      key: "startedAt",
      header: "Started",
      align: "right",
      render: (run) => <span className="text-fg-subtle">{formatRelative(run.startedAt, now)}</span>,
    },
  ];
}

export async function AgentRunsTable({ agentId }: { agentId: string }) {
  const [runs, now] = await Promise.all([loadAgentRuns(agentId), loadNow()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="most recent first">Runs</CardTitle>
      </CardHeader>
      <Guard result={runs} what="agent runs">
        {(paged) => (
          <DataTable
            columns={makeColumns(now)}
            rows={paged.items}
            rowKey={(run) => run.id}
            rowHref={(run) => `/agents/runs/${run.id}`}
            caption="Recent runs for this agent"
            className="max-h-[32rem]"
            emptyTitle="No runs yet"
            emptyDescription="This agent has not been run. Use Run to execute it against the mock LLM gateway."
            footer={paged.total > paged.items.length ? `Showing ${paged.items.length} of ${formatNumber(paged.total)} runs` : undefined}
          />
        )}
      </Guard>
    </Card>
  );
}
