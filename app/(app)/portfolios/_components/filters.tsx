import { humanize } from "@/lib/ui/format";
import { PortfolioStatus } from "@/lib/domain/portfolio";
import { loadDeskIndex } from "@/app/(app)/_lib/data";
import { FilterBar } from "@/app/(app)/_components/filters";

/** Desk + status filters. Desk options come from the desks the role can see. */
export async function PortfolioFilters({ deskId, status }: { deskId?: string; status?: string }) {
  const desks = await loadDeskIndex();
  const deskOptions = [...desks.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }));

  return (
    <FilterBar
      basePath="/portfolios"
      filters={[
        { name: "deskId", label: "Desk", value: deskId, options: deskOptions, allLabel: "All desks", className: "w-60" },
        {
          name: "status",
          label: "Status",
          value: status,
          options: PortfolioStatus.options.map((s) => ({ value: s, label: humanize(s) })),
          allLabel: "All statuses",
        },
      ]}
    />
  );
}
