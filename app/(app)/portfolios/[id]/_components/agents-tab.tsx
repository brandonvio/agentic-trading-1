import { formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { Agent, AgentRun, AutonomyLevel } from "@/lib/domain/agent";
import type { Tone } from "@/lib/ui/status";
import { loadNow } from "@/app/(app)/_lib/data";
import { Guard } from "@/app/(app)/_components/guard";
import { loadAgentRuns, loadAgents } from "./data";

/** Autonomy is a mandate, not a health status, so it gets its own tone scale. */
const AUTONOMY_TONE: Record<AutonomyLevel, Tone> = { advisory: "muted", supervised: "warning", autonomous: "accent" };

function agentColumns(now: number): Column<Agent>[] {
  return [
    { key: "name", header: "Agent", render: (a) => <span className="font-medium text-fg">{a.name}</span> },
    { key: "kind", header: "Kind", render: (a) => <span className="text-fg-muted">{humanize(a.kind)}</span> },
    {
      key: "autonomy",
      header: "Autonomy",
      width: "7.5rem",
      render: (a) => (
        <Badge size="xs" tone={AUTONOMY_TONE[a.autonomy]}>
          {humanize(a.autonomy)}
        </Badge>
      ),
    },
    { key: "status", header: "Status", width: "6.5rem", render: (a) => <StatusBadge kind="agent" value={a.status} size="xs" /> },
    { key: "model", header: "Model", mono: true, render: (a) => <span className="text-fg-subtle">{a.model}</span> },
    { key: "lastRunAt", header: "Last run", align: "right", render: (a) => <span className="text-fg-subtle">{a.lastRunAt ? formatRelative(a.lastRunAt, now) : "Never"}</span> },
  ];
}

function runColumns(now: number): Column<AgentRun>[] {
  return [
    { key: "agentName", header: "Agent", render: (r) => <span className="truncate text-fg">{r.agentName}</span> },
    { key: "objective", header: "Objective", render: (r) => <span className="block max-w-md truncate text-fg-muted" title={r.objective}>{r.objective}</span> },
    { key: "status", header: "Status", width: "7.5rem", render: (r) => <StatusBadge kind="agentRun" value={r.status} size="xs" /> },
    { key: "stepCount", header: "Steps", align: "right", render: (r) => formatNumber(r.stepCount) },
    { key: "costUsd", header: "Cost", align: "right", render: (r) => formatMoney(r.costUsd, "USD", { decimals: 3 }) },
    { key: "startedAt", header: "Started", align: "right", render: (r) => <span className="text-fg-subtle">{formatRelative(r.startedAt, now)}</span> },
  ];
}

export async function AgentsTab({ portfolioId }: { portfolioId: string }) {
  const [agents, runs, now] = await Promise.all([loadAgents(portfolioId), loadAgentRuns(portfolioId), loadNow()]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle hint="scoped to this portfolio">Agents</CardTitle>
        </CardHeader>
        <Guard result={agents} what="agents">
          {(paged) => (
            <DataTable
              columns={agentColumns(now)}
              rows={paged.items}
              rowKey={(a) => a.id}
              rowHref={(a) => `/agents/${a.id}`}
              caption="Agents scoped to this portfolio"
              emptyTitle="No agents scoped here"
              emptyDescription="No agent is bound to this portfolio. Platform-wide agents are listed under Agents."
            />
          )}
        </Guard>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle hint="most recent first">Recent runs</CardTitle>
        </CardHeader>
        <Guard result={runs} what="agent runs">
          {(paged) => (
            <DataTable
              columns={runColumns(now)}
              rows={paged.items}
              rowKey={(r) => r.id}
              rowHref={(r) => `/agents/runs/${r.id}`}
              caption="Recent agent runs for this portfolio"
              emptyTitle="No runs yet"
              emptyDescription="Trigger a cycle from the header to produce a run trace."
            />
          )}
        </Guard>
      </Card>
    </div>
  );
}
