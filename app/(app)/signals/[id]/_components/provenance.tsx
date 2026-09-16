import Link from "next/link";
import { formatDateTime, formatMoney, formatNumber, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import type { Signal } from "@/lib/domain/agent";
import { loadAgentIndex, loadRun, loadStrategyIndex } from "../../_components/data";

/** The agent run and strategy that produced this signal. */
export async function SignalProvenance({ signal }: { signal: Signal }) {
  const [run, agents, strategies] = await Promise.all([
    signal.runId ? loadRun(signal.runId) : null,
    loadAgentIndex(),
    loadStrategyIndex(),
  ]);
  const agent = signal.agentId ? agents.get(signal.agentId) : null;
  const strategy = signal.strategyId ? strategies.get(signal.strategyId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="who raised it">Source</CardTitle>
      </CardHeader>
      <CardBody>
        {!agent && !strategy && !run?.ok ? (
          <EmptyState compact title="No source recorded" description="This signal is not linked to an agent run or a deployed strategy." />
        ) : (
          <div className="space-y-4">
            {agent ? (
              <div>
                <p className="label-caps mb-1.5">Agent</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/agents/${agent.id}`} className="text-xs font-medium text-accent-strong hover:underline">
                    {agent.name}
                  </Link>
                  <StatusBadge kind="agent" value={agent.status} size="xs" />
                  <span className="text-2xs text-fg-subtle">{humanize(agent.kind)}</span>
                  <span className="num text-2xs text-fg-subtle">{agent.model}</span>
                </div>
              </div>
            ) : null}

            {strategy ? (
              <div>
                <p className="label-caps mb-1.5">Strategy</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/strategies/${strategy.id}`} className="text-xs font-medium text-accent-strong hover:underline">
                    <span className="num">{strategy.code}</span> · {strategy.name}
                  </Link>
                  <StatusBadge kind="strategy" value={strategy.status} size="xs" />
                  <span className="text-2xs text-fg-subtle">{humanize(strategy.style)}</span>
                </div>
              </div>
            ) : null}

            {run?.ok ? (
              <div className="border-t border-edge pt-3">
                <p className="label-caps mb-1.5">Run</p>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <Link href={`/agents/runs/${run.value.id}`} className="text-xs font-medium text-accent-strong hover:underline">
                    Open run console →
                  </Link>
                  <StatusBadge kind="agentRun" value={run.value.status} size="xs" />
                </div>
                <DetailGrid cols={4}>
                  <DetailItem label="Trigger" mono={false}>
                    {humanize(run.value.trigger)}
                  </DetailItem>
                  <DetailItem label="Steps">{formatNumber(run.value.stepCount)}</DetailItem>
                  <DetailItem label="Cost">{formatMoney(run.value.costUsd, "USD", { decimals: 4 })}</DetailItem>
                  <DetailItem label="Started">{formatDateTime(run.value.startedAt, { seconds: true })}</DetailItem>
                </DetailGrid>
                {run.value.objective ? <Prose className="mt-3">{run.value.objective}</Prose> : null}
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
