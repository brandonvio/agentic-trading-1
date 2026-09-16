import { humanize } from "@/lib/ui/format";
import { FilterBar } from "@/app/(app)/_components/filters";
import { loadDeskIndex } from "@/app/(app)/_lib/data";
import { StrategyStatus, StrategyStyle } from "@/lib/domain/strategy";

export async function StrategyFilters({ status, style, deskId }: { status?: string; style?: string; deskId?: string }) {
  const desks = await loadDeskIndex();

  return (
    <FilterBar
      basePath="/strategies"
      filters={[
        { name: "status", label: "Status", value: status, options: StrategyStatus.options.map((s) => ({ value: s, label: humanize(s) })), allLabel: "All statuses" },
        { name: "style", label: "Style", value: style, options: StrategyStyle.options.map((s) => ({ value: s, label: humanize(s) })), allLabel: "All styles", className: "w-52" },
        {
          name: "deskId",
          label: "Desk",
          value: deskId,
          options: [...desks.values()].map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
          allLabel: "All desks",
          className: "w-52",
        },
      ]}
    />
  );
}
