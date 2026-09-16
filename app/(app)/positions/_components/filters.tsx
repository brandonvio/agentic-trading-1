import { humanize } from "@/lib/ui/format";
import { AssetClass } from "@/lib/domain/instrument";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import { FilterBar } from "@/app/(app)/_components/filters";

export async function PositionFilters({ portfolioId, assetClass, open }: { portfolioId?: string; assetClass?: string; open?: string }) {
  const portfolios = await loadPortfolioIndex();
  const portfolioOptions = [...portfolios.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));

  return (
    <FilterBar
      basePath="/positions"
      filters={[
        { name: "portfolioId", label: "Portfolio", value: portfolioId, options: portfolioOptions, allLabel: "All portfolios", className: "w-64" },
        {
          name: "assetClass",
          label: "Asset class",
          value: assetClass,
          options: AssetClass.options.map((a) => ({ value: a, label: humanize(a) })),
          allLabel: "All asset classes",
        },
        {
          name: "open",
          label: "State",
          value: open,
          options: [
            { value: "true", label: "Open" },
            { value: "false", label: "Closed" },
          ],
          allLabel: "Open and closed",
          className: "w-40",
        },
      ]}
    />
  );
}
