import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { StopIcon } from "@/components/icons";
import { hasPermission } from "@/lib/auth/permissions";
import { humanize } from "@/lib/ui/format";
import { ActionButton } from "@/app/(app)/_components/action-button";
import { CardSkeleton } from "@/app/(app)/_components/fallbacks";
import { PageGuard } from "@/app/(app)/_components/guard";
import { principal } from "@/app/(app)/_lib/data";
import { RunOverview } from "./_components/run-overview";
import { StepTrace } from "./_components/step-trace";
import { loadRun } from "./_components/data";

export const metadata: Metadata = {
  title: "Agent run · Agentic Prop",
  description: "Objective, budget, tool calls and full reasoning trace for one agent run.",
};

export const dynamic = "force-dynamic";

const LIVE_STATUSES = new Set(["queued", "running"]);

export default async function AgentRunPage(props: PageProps<"/agents/runs/[id]">) {
  const { id } = await props.params;
  const [run, me] = await Promise.all([loadRun(id), principal()]);
  if (!run.ok && run.error.code === "NOT_FOUND") notFound();
  const canKill = hasPermission(me, "agents:kill");

  return (
    <div className="space-y-4">
      <PageGuard result={run} what="this agent run">
        {(r) => {
          const live = LIVE_STATUSES.has(r.status);
          return (
            <>
              <PageHeader
                title={`${r.agentName} · run`}
                breadcrumbs={[
                  { label: "Agents", href: "/agents" },
                  { label: r.agentName, href: `/agents/${r.agentId}` },
                  { label: "Run" },
                ]}
                description={r.objective || `${humanize(r.agentKind)} run triggered by ${r.triggeredBy.name}.`}
                meta={<StatusBadge kind="agentRun" value={r.status} size="sm" />}
                actions={
                  <ActionButton
                    path={`/api/agent-runs/${r.id}/kill`}
                    label="Kill"
                    variant="danger"
                    icon={<StopIcon size={12} />}
                    disabled={!canKill || !live}
                    disabledReason={!canKill ? "Requires the agents:kill permission" : `Run is already ${r.status}`}
                    reasonKey="reason"
                    reasonLabel="Reason for killing this run"
                    reasonPlaceholder="e.g. runaway tool loop, breaching notional budget"
                    confirmTitle="Kill agent run"
                    confirmDescription="The run stops at its current step. Any orders it already submitted are unaffected."
                    confirmLabel="Kill run"
                    successTitle="Run killed"
                  />
                }
              />

              <Suspense fallback={<SkeletonTiles count={5} />}>
                <RunOverview run={r} />
              </Suspense>

              <Suspense fallback={<CardSkeleton rows={8} cols={3} />}>
                <StepTrace runId={r.id} />
              </Suspense>
            </>
          );
        }}
      </PageGuard>
    </div>
  );
}
