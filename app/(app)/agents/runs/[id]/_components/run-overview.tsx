import Link from "next/link";
import { formatDateTime, formatMoney, formatNumber, humanize } from "@/lib/ui/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { JsonView } from "@/components/ui/json-view";
import { StatTile } from "@/components/ui/stat-tile";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { formatDuration } from "@/app/(app)/agents/_components/duration";
import type { AgentRun } from "@/lib/domain/agent";

function LinkedIds({ label, ids, hrefBase }: { label: string; ids: string[]; hrefBase: string }) {
  return (
    <div className="min-w-0">
      <p className="label-caps">
        {label} <span className="num">({ids.length})</span>
      </p>
      {ids.length === 0 ? (
        <p className="mt-1 text-xs text-fg-subtle">None produced.</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id}>
              <Link
                href={`${hrefBase}/${id}`}
                className="num inline-flex h-5 items-center rounded border border-edge-strong bg-surface-2 px-1.5 text-2xs text-fg-muted transition-colors hover:text-fg"
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Objective, provenance, budget consumption and structured IO for one run. */
export async function RunOverview({ run }: { run: AgentRun }) {
  const portfolios = await loadPortfolioIndex();
  const portfolio = run.portfolioId ? portfolios.get(run.portfolioId) : null;
  const hasInput = Object.keys(run.input ?? {}).length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Steps" value={formatNumber(run.stepCount)} hint="Recorded trace entries" />
        <StatTile label="Input tokens" value={formatNumber(run.inputTokens, { compact: true })} hint="Prompt" />
        <StatTile label="Output tokens" value={formatNumber(run.outputTokens, { compact: true })} hint="Completion" />
        <StatTile label="Cost" value={formatMoney(run.costUsd, "USD", { decimals: 4 })} hint="Estimated LLM spend" />
        <StatTile label="Duration" value={formatDuration(run.startedAt, run.finishedAt)} hint={run.finishedAt ? "Completed" : "Still running"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle hint="objective and outcome">Run</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="label-caps">Objective</p>
              <Prose className="mt-1 text-fg">{run.objective || "No objective recorded."}</Prose>
            </div>
            {run.summary ? (
              <div>
                <p className="label-caps">Summary</p>
                <Prose className="mt-1">{run.summary}</Prose>
              </div>
            ) : null}
            {run.error ? (
              <EmptyState compact tone="negative" title="Run failed" description={run.error} />
            ) : null}
            <DetailGrid>
              <DetailItem label="Agent" mono={false}>
                <Link href={`/agents/${run.agentId}`} className="text-accent-strong hover:underline">
                  {run.agentName}
                </Link>
              </DetailItem>
              <DetailItem label="Kind" mono={false}>
                {humanize(run.agentKind)}
              </DetailItem>
              <DetailItem label="Trigger" mono={false}>
                {humanize(run.trigger)}
              </DetailItem>
              <DetailItem label="Triggered by" mono={false}>
                {run.triggeredBy.name} <span className="text-fg-subtle">({run.triggeredBy.kind})</span>
              </DetailItem>
              <DetailItem label="Portfolio" mono={false}>
                {portfolio ? (
                  <Link href={`/portfolios/${portfolio.id}`} className="text-accent-strong hover:underline">
                    {portfolio.code} · {portfolio.name}
                  </Link>
                ) : (
                  (run.portfolioId ?? "Firm-wide")
                )}
              </DetailItem>
              <DetailItem label="Started">{formatDateTime(run.startedAt, { seconds: true })}</DetailItem>
              <DetailItem label="Finished">{run.finishedAt ? formatDateTime(run.finishedAt, { seconds: true }) : "—"}</DetailItem>
            </DetailGrid>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle hint="signals and orders">Produced</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <LinkedIds label="Signals" ids={run.signalIds} hrefBase="/signals" />
            <LinkedIds label="Orders" ids={run.orderIds} hrefBase="/orders" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle hint="structured context and result">Payload</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {hasInput ? <JsonView value={run.input} label="Input" collapseOver={200} /> : <p className="text-xs text-fg-subtle">No structured input was passed to this run.</p>}
          {run.output ? <JsonView value={run.output} label="Output" collapseOver={200} /> : <p className="text-xs text-fg-subtle">No structured output was produced.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
