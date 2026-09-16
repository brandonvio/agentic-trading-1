import { ORDER_STATUS_TONE } from "@/lib/ui/status";
import { humanize } from "@/lib/ui/format";
import { FilterBar } from "@/app/(app)/_components/filters";
import { loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { OrderOrigin, OrderStatus } from "@/lib/domain/order";
import { OrderTicket, type PortfolioOption } from "./order-ticket";

const ORIGINS: OrderOrigin[] = ["manual", "agent", "strategy", "risk_unwind"];

async function portfolioOptions(): Promise<PortfolioOption[]> {
  const index = await loadPortfolioIndex();
  return [...index.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => ({ id: p.id, code: p.code, name: p.name }));
}

/** "New order" launcher for the page header; renders nothing without `orders:create`. */
export async function NewOrderLauncher() {
  return <OrderTicket portfolios={await portfolioOptions()} />;
}

export interface OrdersFilterValues {
  status?: string;
  origin?: string;
  portfolioId?: string;
}

export async function OrdersFilters({ values }: { values: OrdersFilterValues }) {
  const options = await portfolioOptions();
  return (
    <FilterBar
      basePath="/orders"
      filters={[
        {
          name: "status",
          label: "Status",
          value: values.status,
          allLabel: "All statuses",
          className: "w-48",
          options: (Object.keys(ORDER_STATUS_TONE) as OrderStatus[]).map((s) => ({ value: s, label: humanize(s) })),
        },
        {
          name: "origin",
          label: "Origin",
          value: values.origin,
          allLabel: "All origins",
          options: ORIGINS.map((o) => ({ value: o, label: humanize(o) })),
        },
        {
          name: "portfolioId",
          label: "Portfolio",
          value: values.portfolioId,
          allLabel: "All portfolios",
          className: "w-56",
          options: options.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
        },
      ]}
    />
  );
}
