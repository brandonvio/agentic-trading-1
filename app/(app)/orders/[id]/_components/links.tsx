import Link from "next/link";
import { formatDateTime, formatMoney, formatPct, formatSymbol, humanize } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import type { Order } from "@/lib/domain/order";
import { loadApproval, loadRun, loadSignal, loadStrategy } from "../../_components/data";

/** Provenance: the signal, agent run and strategy this order came from. */
export async function OrderProvenance({ order }: { order: Order }) {
  const [signal, run, strategy] = await Promise.all([
    order.signalId ? loadSignal(order.signalId) : null,
    order.agentRunId ? loadRun(order.agentRunId) : null,
    order.strategyId ? loadStrategy(order.strategyId) : null,
  ]);

  const empty = !signal?.ok && !run?.ok && !strategy?.ok;

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="where this order came from">Provenance</CardTitle>
      </CardHeader>
      <CardBody>
        {empty ? (
          <EmptyState
            compact
            title="Manually raised"
            description="This order was not produced by a signal, an agent run or a deployed strategy."
          />
        ) : (
          <div className="space-y-4">
            {signal?.ok ? (
              <div>
                <p className="label-caps mb-1.5">Signal</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/signals/${signal.value.id}`} className="num text-xs font-medium text-accent-strong hover:underline">
                    {formatSymbol(signal.value.symbol)}
                  </Link>
                  <StatusBadge kind="direction" value={signal.value.direction} size="xs" dot={false} />
                  <span className="w-32">
                    <ProgressBar value={signal.value.conviction} tone="accent" size="xs" warnAt={0} showValue label="Conviction" />
                  </span>
                  <span className="num text-xs text-fg-muted">{formatPct(signal.value.expectedReturnPct, { sign: true })} expected</span>
                  <StatusBadge kind="signal" value={signal.value.status} size="xs" />
                </div>
                {signal.value.thesis ? <Prose className="mt-1.5 line-clamp-3">{signal.value.thesis}</Prose> : null}
              </div>
            ) : null}

            {run?.ok ? (
              <div>
                <p className="label-caps mb-1.5">Agent run</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/agents/runs/${run.value.id}`} className="text-xs font-medium text-accent-strong hover:underline">
                    {run.value.agentName}
                  </Link>
                  <StatusBadge kind="agentRun" value={run.value.status} size="xs" />
                  <span className="text-2xs text-fg-subtle">{humanize(run.value.agentKind)}</span>
                  <span className="num text-2xs text-fg-subtle">{formatDateTime(run.value.startedAt)}</span>
                </div>
                {run.value.summary ? <Prose className="mt-1.5 line-clamp-3">{run.value.summary}</Prose> : null}
              </div>
            ) : null}

            {strategy?.ok ? (
              <div>
                <p className="label-caps mb-1.5">Strategy</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/strategies/${strategy.value.id}`} className="text-xs font-medium text-accent-strong hover:underline">
                    <span className="num">{strategy.value.code}</span> · {strategy.value.name}
                  </Link>
                  <StatusBadge kind="strategy" value={strategy.value.status} size="xs" />
                  <span className="text-2xs text-fg-subtle">{humanize(strategy.value.style)}</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Four-eyes approval attached to the order, when one was raised. */
export async function OrderApproval({ order }: { order: Order }) {
  const approval = order.approvalId ? await loadApproval(order.approvalId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="four-eyes">Approval</CardTitle>
        {approval?.ok ? <StatusBadge kind="approval" value={approval.value.status} size="xs" /> : null}
      </CardHeader>
      <CardBody>
        {!order.approvalId ? (
          <EmptyState compact title="No approval required" description="This order cleared pre-trade risk without a four-eyes check." />
        ) : !approval?.ok ? (
          <EmptyState
            compact
            tone="warning"
            title="Approval not visible"
            description="An approval was raised for this order, but your role cannot read the approvals queue."
          />
        ) : (
          <>
            <DetailGrid cols={2}>
              <DetailItem label="Type" mono={false}>
                {humanize(approval.value.type)}
              </DetailItem>
              <DetailItem label="Notional">{formatMoney(approval.value.notional, "USD", { compact: true })}</DetailItem>
              <DetailItem label="Requested by" mono={false}>
                {approval.value.requestedBy.name} <span className="text-fg-subtle">({approval.value.requestedBy.kind})</span>
              </DetailItem>
              <DetailItem label="Requested">{formatDateTime(approval.value.createdAt, { seconds: true })}</DetailItem>
              <DetailItem label="Decided">{approval.value.decidedAt ? formatDateTime(approval.value.decidedAt, { seconds: true }) : "—"}</DetailItem>
              <DetailItem label="Expires">{formatDateTime(approval.value.expiresAt)}</DetailItem>
            </DetailGrid>
            {approval.value.riskSummary ? (
              <div className="mt-3 border-t border-edge pt-3">
                <p className="label-caps mb-1">Risk summary</p>
                <Prose>{approval.value.riskSummary}</Prose>
              </div>
            ) : null}
            {approval.value.decisionNote ? (
              <div className="mt-3 border-t border-edge pt-3">
                <p className="label-caps mb-1">Decision note</p>
                <Prose>{approval.value.decisionNote}</Prose>
              </div>
            ) : null}
            <Link href="/approvals" className="mt-3 inline-flex text-xs text-accent-strong hover:underline">
              Open approvals queue →
            </Link>
          </>
        )}
      </CardBody>
    </Card>
  );
}
