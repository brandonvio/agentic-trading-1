import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { humanize } from "@/lib/ui/format";
import { CardSkeleton, DetailSkeleton } from "@/app/(app)/_components/fallbacks";
import { PageGuard } from "@/app/(app)/_components/guard";
import { RunAgentButton } from "@/app/(app)/agents/_components/run-agent-button";
import { AgentConfiguration } from "./_components/config";
import { AgentRunsTable } from "./_components/runs-table";
import { loadAgent } from "./_components/data";

export const metadata: Metadata = {
  title: "Agent · Agentic Prop",
  description: "Agent configuration, guardrails and run history.",
};

export const dynamic = "force-dynamic";

export default async function AgentDetailPage(props: PageProps<"/agents/[id]">) {
  const { id } = await props.params;
  const agent = await loadAgent(id);
  if (!agent.ok && agent.error.code === "NOT_FOUND") notFound();

  return (
    <div className="space-y-4">
      <PageGuard result={agent} what="this agent">
        {(a) => (
          <>
            <PageHeader
              title={a.name}
              breadcrumbs={[{ label: "Agents", href: "/agents" }, { label: a.name }]}
              description={`${humanize(a.kind)} · ${a.model}`}
              meta={
                <>
                  <StatusBadge kind="agent" value={a.status} size="sm" />
                  <Badge tone={a.autonomy === "autonomous" ? "accent" : a.autonomy === "supervised" ? "warning" : "muted"} size="sm">
                    {humanize(a.autonomy)}
                  </Badge>
                </>
              }
              actions={<RunAgentButton agentId={a.id} agentName={a.name} agentStatus={a.status} size="sm" variant="primary" label="Run agent" />}
            />

            <Suspense fallback={<DetailSkeleton lines={6} />}>
              <AgentConfiguration agent={a} />
            </Suspense>

            <Suspense fallback={<CardSkeleton rows={6} cols={9} />}>
              <AgentRunsTable agentId={a.id} />
            </Suspense>
          </>
        )}
      </PageGuard>
    </div>
  );
}
