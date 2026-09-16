import { humanize } from "@/lib/ui/format";
import { FilterBar } from "@/app/(app)/_components/filters";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { SIGNAL_STATUS_TONE } from "@/lib/ui/status";
import type { SignalStatus } from "@/lib/domain/agent";
import { loadAgentIndex } from "./data";

export interface SignalsFilterValues {
  status?: string;
  portfolioId?: string;
  agentId?: string;
}

export async function SignalsFilters({ values }: { values: SignalsFilterValues }) {
  const [portfolios, agents] = await Promise.all([loadPortfolioIndex(), loadAgentIndex()]);

  return (
    <FilterBar
      basePath="/signals"
      filters={[
        {
          name: "status",
          label: "Status",
          value: values.status,
          allLabel: "All statuses",
          options: (Object.keys(SIGNAL_STATUS_TONE) as SignalStatus[]).map((s) => ({ value: s, label: humanize(s) })),
        },
        {
          name: "portfolioId",
          label: "Portfolio",
          value: values.portfolioId,
          allLabel: "All portfolios",
          className: "w-56",
          options: [...portfolios.values()]
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
        },
        {
          name: "agentId",
          label: "Agent",
          value: values.agentId,
          allLabel: "All agents",
          className: "w-56",
          options: [...agents.values()].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ value: a.id, label: a.name })),
        },
      ]}
    />
  );
}
