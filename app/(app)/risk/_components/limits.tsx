import { humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { RiskLimit, RiskLimitScope } from "@/lib/domain/risk";
import { FilterBar } from "../../_components/filters";
import { Guard } from "../../_components/guard";
import { loadDeskIndex, loadPortfolioIndex } from "../../_lib/data";
import { loadLimits } from "./data";
import { LimitRowActions, NewLimitButton, type ScopeOptions } from "./limit-form";
import { SCOPE_OPTIONS, formatThreshold } from "./metrics";

function makeColumns(scopeLabel: (limit: RiskLimit) => string, options: ScopeOptions): Column<RiskLimit>[] {
  return [
    {
      key: "name",
      header: "Limit",
      render: (l) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{l.name}</span>
          <span className="block truncate text-2xs text-fg-subtle">
            {humanize(l.metric)}
            {l.qualifier ? ` · ${l.qualifier}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      width: "11rem",
      render: (l) => (
        <span className="block min-w-0">
          <span className="block text-fg-muted">{humanize(l.scope)}</span>
          <span className="block truncate text-2xs text-fg-subtle">{scopeLabel(l)}</span>
        </span>
      ),
    },
    { key: "threshold", header: "Threshold", align: "right", render: (l) => formatThreshold(l.metric, l.threshold) },
    {
      key: "warnThreshold",
      header: "Warn at",
      align: "right",
      render: (l) => (l.warnThreshold === null ? <span className="text-fg-subtle">—</span> : formatThreshold(l.metric, l.warnThreshold)),
    },
    {
      key: "action",
      header: "On breach",
      width: "9rem",
      render: (l) => (
        <Badge tone={l.action === "block" || l.action === "auto_unwind" ? "negative" : l.action === "require_approval" ? "warning" : "muted"} size="xs">
          {humanize(l.action)}
        </Badge>
      ),
    },
    {
      key: "enabled",
      header: "State",
      width: "6rem",
      render: (l) => (
        <Badge tone={l.enabled ? "positive" : "muted"} size="xs" dot>
          {l.enabled ? "Enabled" : "Disabled"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "11rem",
      mono: false,
      render: (l) => <LimitRowActions limit={l} options={options} />,
    },
  ];
}

/** Risk limit catalogue with create / edit / delete. */
export async function LimitsPanel({ scope }: { scope: RiskLimitScope | undefined }) {
  const [limits, portfolios, desks] = await Promise.all([loadLimits(scope), loadPortfolioIndex(), loadDeskIndex()]);

  const options: ScopeOptions = {
    portfolios: [...portfolios.values()].map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
    desks: [...desks.values()].map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
  };

  const scopeLabel = (limit: RiskLimit): string => {
    if (limit.scope === "platform") return "Firm-wide";
    if (!limit.scopeId) return "—";
    if (limit.scope === "portfolio") return portfolios.get(limit.scopeId)?.code ?? limit.scopeId;
    if (limit.scope === "desk") return desks.get(limit.scopeId)?.code ?? limit.scopeId;
    return limit.scopeId;
  };

  const columns = makeColumns(scopeLabel, options);

  return (
    <div className="space-y-4">
      <FilterBar
        basePath="/risk"
        preserve={{ tab: "limits" }}
        filters={[{ name: "scope", label: "Scope", value: scope, allLabel: "All scopes", options: SCOPE_OPTIONS }]}
        actions={<NewLimitButton options={options} />}
      />
      <Card>
        <CardHeader>
          <CardTitle hint="evaluated on every order and scan">Risk limits</CardTitle>
        </CardHeader>
        <Guard result={limits} what="risk limits">
          {(paged) => (
            <DataTable
              columns={columns}
              rows={paged.items}
              rowKey={(l) => l.id}
              caption="Configured risk limits"
              emptyTitle="No limits configured"
              emptyDescription="Nothing constrains trading at this scope yet. Create a limit to start pre-trade enforcement."
              footer={paged.total > paged.items.length ? `Showing ${paged.items.length} of ${paged.total} limits` : undefined}
            />
          )}
        </Guard>
      </Card>
    </div>
  );
}
