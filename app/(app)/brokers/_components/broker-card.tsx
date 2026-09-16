import { formatNumber, formatRelative, humanize } from "@/lib/ui/format";
import { toneFor } from "@/lib/ui/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailGrid, DetailItem } from "@/app/(app)/_components/detail";
import type { BrokerCapabilities, BrokerHealth } from "@/lib/brokers/types";
import type { BrokerAccount, Portfolio } from "@/lib/domain/portfolio";
import { AccountsTable } from "./accounts-table";

export interface BrokerCardProps {
  capabilities: BrokerCapabilities;
  health: BrokerHealth;
  accountCount: number;
  accounts: BrokerAccount[];
  portfolios: Map<string, Portfolio>;
  canManage: boolean;
  now: number;
}

function Capability({ label, supported }: { label: string; supported: boolean }) {
  return (
    <Badge tone={supported ? "positive" : "muted"} size="xs" dot={false} title={supported ? `${label} supported` : `${label} not supported`}>
      {supported ? "✓" : "✕"} {label}
    </Badge>
  );
}

/** One venue: connectivity, capabilities and the accounts routed through it. */
export function BrokerCard({ capabilities, health, accountCount, accounts, portfolios, canManage, now }: BrokerCardProps) {
  return (
    <Card aria-labelledby={`broker-${capabilities.broker}`}>
      <CardHeader
        actions={
          <span className="num text-2xs text-fg-subtle">
            {formatNumber(health.latencyMs)} ms · {formatNumber(accountCount)} {accountCount === 1 ? "account" : "accounts"}
          </span>
        }
      >
        <CardTitle className="normal-case tracking-normal text-sm text-fg" hint={capabilities.broker.toUpperCase()}>
          <span id={`broker-${capabilities.broker}`}>{capabilities.displayName}</span>
        </CardTitle>
        <Badge tone={toneFor("brokerAccount", health.status)} size="xs" dot>
          {humanize(health.status)}
        </Badge>
      </CardHeader>

      <CardBody className="space-y-3">
        <p className="text-xs text-fg-muted">{health.message}</p>
        <DetailGrid cols={4}>
          <DetailItem label="Session hours" mono={false}>
            {capabilities.sessionHours}
          </DetailItem>
          <DetailItem label="Typical latency">{formatNumber(capabilities.typicalLatencyMs)} ms</DetailItem>
          <DetailItem label="Observed latency">{formatNumber(health.latencyMs)} ms</DetailItem>
          <DetailItem label="Last heartbeat">{health.lastHeartbeatAt ? formatRelative(health.lastHeartbeatAt, now) : "—"}</DetailItem>
        </DetailGrid>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-caps mr-1">Asset classes</span>
          {capabilities.assetClasses.map((assetClass) => (
            <Badge key={assetClass} tone="info" size="xs" dot={false}>
              {humanize(assetClass)}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-caps mr-1">Order types</span>
          <Capability label="Short" supported={capabilities.supportsShort} />
          <Capability label="Limit" supported={capabilities.supportsLimit} />
          <Capability label="Stop" supported={capabilities.supportsStop} />
        </div>
      </CardBody>

      <div className="border-t border-edge">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <h3 className="label-caps">Linked accounts</h3>
          {accounts.length > 0 ? <span className="num text-2xs text-fg-subtle">{formatNumber(accounts.length)} linked</span> : null}
        </div>
        <AccountsTable
          accounts={accounts}
          portfolios={portfolios}
          canManage={canManage}
          now={now}
          brokerName={capabilities.displayName}
        />
      </div>
    </Card>
  );
}
