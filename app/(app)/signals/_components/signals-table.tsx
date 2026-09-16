import { formatDateTime, formatMoney, formatNumber, formatPct, formatRelative, formatSymbol } from "@/lib/ui/format";
import { toneForSign } from "@/lib/ui/status";
import { StatusBadge, TONE_TEXT } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Guard } from "@/app/(app)/_components/guard";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { Agent, Signal } from "@/lib/domain/agent";
import type { Portfolio } from "@/lib/domain/portfolio";
import type { Strategy } from "@/lib/domain/strategy";
import { loadAgentIndex, loadSignals, loadStrategyIndex, type SignalFilter } from "./data";
import { ActSignalButton, DismissSignalButton } from "./signal-actions";

function horizon(hours: number): string {
  if (hours >= 24 * 7) return `${formatNumber(hours / (24 * 7), { decimals: 1 })}w`;
  if (hours >= 24) return `${formatNumber(hours / 24, { decimals: 1 })}d`;
  return `${formatNumber(hours, { decimals: 0 })}h`;
}

interface Indexes {
  now: number;
  agents: Map<string, Agent>;
  strategies: Map<string, Strategy>;
  portfolios: Map<string, Portfolio>;
}

function makeColumns({ now, agents, strategies, portfolios }: Indexes): Column<Signal>[] {
  return [
    {
      key: "symbol",
      header: "Instrument",
      mono: true,
      render: (signal) => <span className="font-medium text-fg">{formatSymbol(signal.symbol)}</span>,
    },
    {
      key: "direction",
      header: "Direction",
      width: "5.5rem",
      render: (signal) => <StatusBadge kind="direction" value={signal.direction} size="xs" dot={false} />,
    },
    {
      key: "conviction",
      header: "Conviction",
      width: "10rem",
      render: (signal) => <ProgressBar value={signal.conviction} tone="accent" size="xs" warnAt={0} showValue />,
    },
    {
      key: "expectedReturnPct",
      header: "Exp. return",
      align: "right",
      render: (signal) => (
        <span className={TONE_TEXT[toneForSign(signal.expectedReturnPct)]}>{formatPct(signal.expectedReturnPct, { sign: true })}</span>
      ),
    },
    { key: "horizonHours", header: "Horizon", align: "right", width: "5rem", render: (signal) => horizon(signal.horizonHours) },
    {
      key: "suggestedNotional",
      header: "Notional",
      align: "right",
      render: (signal) => formatMoney(signal.suggestedNotional, "USD", { compact: true }),
    },
    {
      key: "source",
      header: "Source",
      render: (signal) => {
        const agent = signal.agentId ? agents.get(signal.agentId) : null;
        const strategy = signal.strategyId ? strategies.get(signal.strategyId) : null;
        if (!agent && !strategy) return <span className="text-fg-subtle">—</span>;
        return (
          <span className="block min-w-0">
            <span className="block truncate text-fg-muted">{agent?.name ?? strategy?.name}</span>
            {agent && strategy ? <span className="num block truncate text-2xs text-fg-subtle">{strategy.code}</span> : null}
          </span>
        );
      },
    },
    {
      key: "portfolio",
      header: "Portfolio",
      width: "6.5rem",
      mono: true,
      render: (signal) => (
        <span className="text-fg-muted">{signal.portfolioId ? (portfolios.get(signal.portfolioId)?.code ?? signal.portfolioId) : "—"}</span>
      ),
    },
    { key: "status", header: "Status", width: "6.5rem", render: (signal) => <StatusBadge kind="signal" value={signal.status} size="xs" /> },
    {
      key: "createdAt",
      header: "Age",
      align: "right",
      width: "5rem",
      render: (signal) => (
        <span className="text-fg-subtle" title={formatDateTime(signal.createdAt, { seconds: true })}>
          {formatRelative(signal.createdAt, now)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "9.5rem",
      className: "relative z-[1]",
      render: (signal) =>
        signal.status === "new" ? (
          <span className="flex items-center justify-end gap-1.5">
            <ActSignalButton signalId={signal.id} symbol={signal.symbol} />
            <DismissSignalButton signalId={signal.id} symbol={signal.symbol} />
          </span>
        ) : null,
    },
  ];
}

export async function SignalsTable({ filter, filtered }: { filter: SignalFilter; filtered: boolean }) {
  const [signals, now, agents, strategies, portfolios] = await Promise.all([
    loadSignals(filter),
    loadNow(),
    loadAgentIndex(),
    loadStrategyIndex(),
    loadPortfolioIndex(),
  ]);
  const columns = makeColumns({ now, agents, strategies, portfolios });

  return (
    <Card>
      <CardHeader>
        <CardTitle hint={filtered ? "filtered" : "highest conviction first"}>Signals</CardTitle>
      </CardHeader>
      <Guard result={signals} what="agent signals">
        {(paged) => {
          const rows = [...paged.items].sort((a, b) => {
            if (a.status === "new" && b.status !== "new") return -1;
            if (b.status === "new" && a.status !== "new") return 1;
            return b.conviction - a.conviction;
          });
          return (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(signal) => signal.id}
              rowHref={(signal) => `/signals/${signal.id}`}
              caption="Agent and strategy signals"
              className="max-h-[70vh]"
              emptyTitle={filtered ? "No signals match these filters" : "No signals yet"}
              emptyDescription={
                filtered
                  ? "Clear the filters to see every idea your role can read."
                  : "Signal-generation agents have not produced any trade ideas. Run an agent or a portfolio cycle to create some."
              }
              footer={paged.total > rows.length ? `Showing ${formatNumber(rows.length)} of ${formatNumber(paged.total)} signals` : undefined}
            />
          );
        }}
      </Guard>
    </Card>
  );
}
