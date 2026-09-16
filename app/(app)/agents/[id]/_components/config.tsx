import { formatDateTime, formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import { loadDeskIndex, loadNow, loadPortfolioIndex, loadUserIndex } from "@/app/(app)/_lib/data";
import type { Agent } from "@/lib/domain/agent";

/** Configuration, mandate and guardrails for a single agent. */
export async function AgentConfiguration({ agent }: { agent: Agent }) {
  const [portfolios, desks, users, now] = await Promise.all([loadPortfolioIndex(), loadDeskIndex(), loadUserIndex(), loadNow()]);
  const portfolio = agent.portfolioId ? portfolios.get(agent.portfolioId) : null;
  const desk = agent.deskId ? desks.get(agent.deskId) : null;
  const owner = users.get(agent.ownerUserId);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle hint="mandate and model">Configuration</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Prose>{agent.description || "No description recorded for this agent."}</Prose>
          <DetailGrid>
            <DetailItem label="Kind" mono={false}>
              {humanize(agent.kind)}
            </DetailItem>
            <DetailItem label="Model">{agent.model}</DetailItem>
            <DetailItem label="Autonomy" mono={false}>
              {humanize(agent.autonomy)}
            </DetailItem>
            <DetailItem label="Status" mono={false}>
              <StatusBadge kind="agent" value={agent.status} size="xs" />
            </DetailItem>
            <DetailItem label="Owner" mono={false}>
              {owner?.name ?? agent.ownerUserId}
            </DetailItem>
            <DetailItem label="Portfolio" mono={false}>
              {portfolio ? `${portfolio.code} · ${portfolio.name}` : agent.portfolioId ? agent.portfolioId : "Firm-wide"}
            </DetailItem>
            <DetailItem label="Desk" mono={false}>
              {desk ? `${desk.code} · ${desk.name}` : (agent.deskId ?? "—")}
            </DetailItem>
            <DetailItem label="Strategies">{agent.strategyIds.length > 0 ? formatNumber(agent.strategyIds.length) : "—"}</DetailItem>
            <DetailItem label="Schedule" mono={false}>
              {agent.schedule.description || "Manual only"}
              {agent.schedule.intervalMinutes ? ` · every ${formatNumber(agent.schedule.intervalMinutes)}m` : ""}
              {agent.schedule.enabled ? "" : " · disabled"}
            </DetailItem>
            <DetailItem label="Max steps / run">{formatNumber(agent.maxStepsPerRun)}</DetailItem>
            <DetailItem label="Max notional / run">{formatMoney(agent.maxNotionalPerRun, "USD", { compact: true })}</DetailItem>
            <DetailItem label="Last run">{agent.lastRunAt ? `${formatRelative(agent.lastRunAt, now)} · ${formatDateTime(agent.lastRunAt)}` : "Never"}</DetailItem>
          </DetailGrid>
        </CardBody>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle hint={`${agent.guardrails.length}`}>Guardrails</CardTitle>
          </CardHeader>
          <CardBody>
            {agent.guardrails.length === 0 ? (
              <p className="text-xs text-fg-subtle">No explicit guardrails; the agent inherits the portfolio mandate only.</p>
            ) : (
              <ul className="space-y-2">
                {agent.guardrails.map((rule) => (
                  <li key={rule} className="flex gap-2 text-xs text-fg-muted">
                    <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                    <span className="min-w-0">{rule}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle hint={`${agent.tools.length} permitted`}>Tools</CardTitle>
          </CardHeader>
          <CardBody>
            {agent.tools.length === 0 ? (
              <p className="text-xs text-fg-subtle">This agent may not call any tools.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => (
                  <li key={tool}>
                    <Badge tone="muted" size="sm" mono dot={false}>
                      {tool}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
