import { formatNumber, humanize } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { JsonView } from "@/components/ui/json-view";
import { Timeline, type TimelineEvent } from "@/components/ui/timeline";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow } from "@/app/(app)/_lib/data";
import { formatMillis } from "@/app/(app)/agents/_components/duration";
import type { AgentStep, AgentStepKind } from "@/lib/domain/agent";
import { loadRunSteps } from "./data";

const STEP_TONE: Record<AgentStepKind, Tone> = {
  thought: "muted",
  tool_call: "accent",
  tool_result: "positive",
  message: "info",
  error: "negative",
};

function stepEvent(step: AgentStep): TimelineEvent {
  const hasIo = step.toolInput !== null || step.toolOutput !== null;
  return {
    id: step.id,
    at: step.at,
    tone: STEP_TONE[step.kind],
    title: (
      <span className="flex min-w-0 items-center gap-2">
        <span className="num text-2xs text-fg-subtle">#{String(step.index).padStart(2, "0")}</span>
        <span>{humanize(step.kind)}</span>
        {step.toolName ? (
          <Badge tone="muted" size="xs" mono dot={false}>
            {step.toolName}
          </Badge>
        ) : null}
      </span>
    ),
    description: step.content ? <span className="block whitespace-pre-wrap break-words">{step.content}</span> : null,
    meta: (
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 num text-2xs text-fg-subtle">
          {step.latencyMs > 0 ? <span>{formatMillis(step.latencyMs)}</span> : null}
          {step.inputTokens + step.outputTokens > 0 ? (
            <span>
              {formatNumber(step.inputTokens)} in · {formatNumber(step.outputTokens)} out
            </span>
          ) : null}
        </div>
        {hasIo ? (
          <div className="space-y-1.5">
            {step.toolInput !== null && step.toolInput !== undefined ? <JsonView value={step.toolInput} label="Tool input" collapseOver={160} maxHeight="16rem" /> : null}
            {step.toolOutput !== null && step.toolOutput !== undefined ? <JsonView value={step.toolOutput} label="Tool output" collapseOver={160} maxHeight="16rem" /> : null}
          </div>
        ) : null}
      </div>
    ),
  };
}

/** The full ordered reasoning/acting trace for a run. */
export async function StepTrace({ runId }: { runId: string }) {
  const [steps, now] = await Promise.all([loadRunSteps(runId), loadNow()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint={steps.ok ? `${steps.value.length} steps` : undefined}>Step trace</CardTitle>
      </CardHeader>
      <Guard result={steps} what="agent run steps">
        {(list) => (
          <CardBody>
            <Timeline
              now={now}
              events={[...list].sort((a, b) => a.index - b.index).map(stepEvent)}
              emptyText="No steps were recorded for this run."
            />
          </CardBody>
        )}
      </Guard>
    </Card>
  );
}
