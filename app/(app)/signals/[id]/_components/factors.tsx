import { formatNumber } from "@/lib/ui/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Signal } from "@/lib/domain/agent";

type Factor = Signal["factors"][number];

function makeColumns(maxWeight: number): Column<Factor>[] {
  return [
    { key: "factor", header: "Factor", width: "14rem", render: (f) => <span className="text-fg">{f.factor}</span> },
    {
      key: "weight",
      header: "Weight",
      width: "12rem",
      render: (f) => (
        <span className="flex items-center gap-2">
          <ProgressBar
            value={maxWeight > 0 ? Math.abs(f.weight) / maxWeight : 0}
            tone={f.weight < 0 ? "negative" : "accent"}
            size="xs"
            warnAt={0}
            className="w-24"
            label={`${f.factor} weight`}
          />
          <span className="num w-12 text-right text-xs text-fg-muted">{formatNumber(f.weight, { decimals: 2, sign: true })}</span>
        </span>
      ),
    },
    { key: "evidence", header: "Evidence", render: (f) => <span className="whitespace-normal text-fg-muted">{f.evidence}</span> },
  ];
}

/** Weighted factors behind the signal, strongest first. */
export function SignalFactors({ signal }: { signal: Signal }) {
  const rows = [...signal.factors].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const maxWeight = rows.reduce((m, f) => Math.max(m, Math.abs(f.weight)), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle hint="what drives the idea">Factors</CardTitle>
      </CardHeader>
      <DataTable
        columns={makeColumns(maxWeight)}
        rows={rows}
        rowKey={(f, i) => `${f.factor}-${i}`}
        dense={false}
        caption="Factors behind this signal"
        emptyTitle="No factors recorded"
        emptyDescription="The agent did not attach weighted factors to this idea."
      />
    </Card>
  );
}
