import Link from "next/link";
import { formatMoney, formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentsIcon, ArrowUpRightIcon } from "@/components/icons";
import { DetailGrid, DetailItem } from "@/app/(app)/_components/detail";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { Agent, AgentKind, AgentStatus, AutonomyLevel } from "@/lib/domain/agent";
import { loadAgents } from "./data";
import { RunAgentButton } from "./run-agent-button";

/** How much rope the agent has; mirrors the autonomy ladder in the domain model. */
const AUTONOMY_TONE: Record<AutonomyLevel, Tone> = {
  advisory: "muted",
  supervised: "warning",
  autonomous: "accent",
};

function AgentCard({ agent, portfolioCode, now }: { agent: Agent; portfolioCode: string; now: number }) {
  const shownTools = agent.tools.slice(0, 5);
  const extraTools = agent.tools.length - shownTools.length;

  return (
    <article className="panel flex min-w-0 flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-fg">
            <Link href={`/agents/${agent.id}`} className="hover:text-accent-strong transition-colors">
              {agent.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-2xs text-fg-subtle">{humanize(agent.kind)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge kind="agent" value={agent.status} size="xs" />
          <Badge tone={AUTONOMY_TONE[agent.autonomy]} size="xs" title={`Autonomy: ${agent.autonomy}`}>
            {humanize(agent.autonomy)}
          </Badge>
        </div>
      </header>

      <p className="line-clamp-2 text-xs text-fg-muted">{agent.description || "No description."}</p>

      <DetailGrid cols={2} className="gap-y-2">
        <DetailItem label="Model">{agent.model}</DetailItem>
        <DetailItem label="Portfolio">{portfolioCode}</DetailItem>
        <DetailItem label="Last run">{agent.lastRunAt ? formatRelative(agent.lastRunAt, now) : "Never"}</DetailItem>
        <DetailItem label="Schedule" mono={false}>
          <span className={agent.schedule.enabled ? "text-fg" : "text-fg-subtle"}>
            {agent.schedule.description || "Manual only"}
            {agent.schedule.enabled ? "" : " · off"}
          </span>
        </DetailItem>
      </DetailGrid>

      {agent.tools.length > 0 ? (
        <ul aria-label="Permitted tools" className="flex flex-wrap gap-1">
          {shownTools.map((tool) => (
            <li key={tool}>
              <Badge tone="muted" size="xs" mono dot={false}>
                {tool}
              </Badge>
            </li>
          ))}
          {extraTools > 0 ? (
            <li>
              <Badge tone="muted" size="xs" dot={false} title={agent.tools.join(", ")}>
                +{extraTools}
              </Badge>
            </li>
          ) : null}
        </ul>
      ) : null}

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-edge pt-3">
        <span className="num text-2xs text-fg-subtle">
          {formatNumber(agent.maxStepsPerRun)} steps · {formatMoney(agent.maxNotionalPerRun, "USD", { compact: true })} cap
        </span>
        <div className="flex items-center gap-2">
          <RunAgentButton agentId={agent.id} agentName={agent.name} agentStatus={agent.status} />
          <ButtonLink href={`/agents/${agent.id}`} size="xs" variant="ghost" icon={<ArrowUpRightIcon size={12} />}>
            Open
          </ButtonLink>
        </div>
      </footer>
    </article>
  );
}

export async function AgentGrid({ kind, status, portfolioId }: { kind?: AgentKind; status?: AgentStatus; portfolioId?: string }) {
  const [agents, portfolios, now] = await Promise.all([loadAgents(kind, status, portfolioId), loadPortfolioIndex(), loadNow()]);
  const filtered = Boolean(kind || status || portfolioId);

  return (
    <Guard result={agents} what="agents">
      {(paged) =>
        paged.items.length === 0 ? (
          <EmptyState
            icon={<AgentsIcon size={20} />}
            title={filtered ? "No agents match these filters" : "No agents configured"}
            description={
              filtered
                ? "Clear the filters to see every agent your role can view."
                : "No agent is visible to your role yet. Agents appear here once the platform is seeded or one is created."
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paged.items.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                portfolioCode={agent.portfolioId ? (portfolios.get(agent.portfolioId)?.code ?? agent.portfolioId) : "Firm-wide"}
                now={now}
              />
            ))}
          </div>
        )
      }
    </Guard>
  );
}
