import { formatDateTime, formatMoney, formatNumber, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import { loadDeskIndex, loadPortfolioIndex, loadUserIndex } from "@/app/(app)/_lib/data";
import type { Strategy } from "@/lib/domain/strategy";

interface DeploymentRow {
  portfolioId: string;
  label: string;
  allocatedCapital: number;
  deployedAt: string;
}

const deploymentColumns: Column<DeploymentRow>[] = [
  { key: "label", header: "Portfolio", render: (row) => <span className="text-fg">{row.label}</span> },
  { key: "allocatedCapital", header: "Allocated", align: "right", render: (row) => formatMoney(row.allocatedCapital, "USD", { compact: true }) },
  { key: "deployedAt", header: "Deployed", align: "right", render: (row) => formatDateTime(row.deployedAt) },
];

/** Thesis, parameters and portfolio deployments. */
export async function StrategyOverview({ strategy }: { strategy: Strategy }) {
  const [portfolios, desks, users] = await Promise.all([loadPortfolioIndex(), loadDeskIndex(), loadUserIndex()]);
  const parameters = Object.entries(strategy.parameters ?? {});
  const rows: DeploymentRow[] = strategy.deployments.map((d) => ({
    portfolioId: d.portfolioId,
    label: portfolios.get(d.portfolioId) ? `${portfolios.get(d.portfolioId)!.code} · ${portfolios.get(d.portfolioId)!.name}` : d.portfolioId,
    allocatedCapital: d.allocatedCapital,
    deployedAt: d.deployedAt,
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle hint="what the strategy believes">Thesis</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Prose className="text-fg">{strategy.thesis || "No thesis recorded."}</Prose>
          {strategy.description ? <Prose>{strategy.description}</Prose> : null}
          <DetailGrid>
            <DetailItem label="Style" mono={false}>
              {humanize(strategy.style)}
            </DetailItem>
            <DetailItem label="Owner" mono={false}>
              {users.get(strategy.ownerUserId)?.name ?? strategy.ownerUserId}
            </DetailItem>
            <DetailItem label="Desk" mono={false}>
              {desks.get(strategy.deskId) ? `${desks.get(strategy.deskId)!.code} · ${desks.get(strategy.deskId)!.name}` : strategy.deskId}
            </DetailItem>
            <DetailItem label="Universe">{formatNumber(strategy.instrumentIds.length)} instruments</DetailItem>
            <DetailItem label="Version">v{formatNumber(strategy.version)}</DetailItem>
            <DetailItem label="Updated">{formatDateTime(strategy.updatedAt)}</DetailItem>
          </DetailGrid>
          <div>
            <p className="label-caps mb-1.5">Asset classes</p>
            <ul className="flex flex-wrap gap-1.5">
              {strategy.assetClasses.map((a) => (
                <li key={a}>
                  <Badge tone="muted" size="sm" dot={false}>
                    {humanize(a)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle hint={`${parameters.length}`}>Parameters</CardTitle>
        </CardHeader>
        <CardBody>
          {parameters.length === 0 ? (
            <p className="text-xs text-fg-subtle">This strategy has no tunable parameters.</p>
          ) : (
            <dl className="divide-y divide-edge">
              {parameters.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <dt className="min-w-0 truncate text-xs text-fg-muted">{key}</dt>
                  <dd className="num shrink-0 text-xs text-fg">{typeof value === "number" ? formatNumber(value, { decimals: Number.isInteger(value) ? 0 : 4 }) : String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle hint="capital allocated per portfolio">Deployments</CardTitle>
        </CardHeader>
        <DataTable
          columns={deploymentColumns}
          rows={rows}
          rowKey={(row) => row.portfolioId}
          rowHref={(row) => `/portfolios/${row.portfolioId}`}
          caption="Portfolios this strategy is deployed to"
          emptyTitle="Not deployed"
          emptyDescription="This strategy has not been deployed to a portfolio in paper or live mode."
        />
      </Card>
    </div>
  );
}
