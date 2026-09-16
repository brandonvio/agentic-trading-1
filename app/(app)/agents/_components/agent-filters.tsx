import { humanize } from "@/lib/ui/format";
import { FilterBar } from "@/app/(app)/_components/filters";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { AgentKind, AgentStatus } from "@/lib/domain/agent";

/** Kind / status / portfolio filters, driven by the URL. */
export async function AgentFilters({ kind, status, portfolioId }: { kind?: string; status?: string; portfolioId?: string }) {
  const portfolios = await loadPortfolioIndex();

  return (
    <FilterBar
      basePath="/agents"
      filters={[
        { name: "kind", label: "Kind", value: kind, options: AgentKind.options.map((k) => ({ value: k, label: humanize(k) })), allLabel: "All kinds" },
        { name: "status", label: "Status", value: status, options: AgentStatus.options.map((s) => ({ value: s, label: humanize(s) })), allLabel: "All statuses" },
        {
          name: "portfolioId",
          label: "Portfolio",
          value: portfolioId,
          options: [...portfolios.values()].map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
          allLabel: "All portfolios",
          className: "w-56",
        },
      ]}
    />
  );
}
