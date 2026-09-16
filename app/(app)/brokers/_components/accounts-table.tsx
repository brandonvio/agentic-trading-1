import Link from "next/link";
import { formatMoney, formatRelative } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RefreshIcon } from "@/components/icons";
import { ActionButton } from "@/app/(app)/_components/action-button";
import type { BrokerAccount, Portfolio } from "@/lib/domain/portfolio";
import { AccountStatusSelect } from "./account-status";

export interface AccountsTableProps {
  accounts: BrokerAccount[];
  portfolios: Map<string, Portfolio>;
  canManage: boolean;
  now: number;
  brokerName: string;
}

function makeColumns(props: AccountsTableProps): Column<BrokerAccount>[] {
  const { portfolios, canManage, now } = props;
  return [
    {
      key: "label",
      header: "Account",
      render: (a) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{a.label}</span>
          <span className="num block truncate text-2xs text-fg-subtle">{a.externalAccountId}</span>
        </span>
      ),
    },
    {
      key: "portfolio",
      header: "Portfolio",
      render: (a) => {
        const portfolio = portfolios.get(a.portfolioId);
        return portfolio ? (
          <Link href={`/portfolios/${portfolio.id}`} className="num text-accent-strong hover:underline">
            {portfolio.code}
          </Link>
        ) : (
          <span className="num text-fg-subtle">{a.portfolioId}</span>
        );
      },
    },
    { key: "currency", header: "Ccy", width: "4rem", mono: true, render: (a) => a.currency },
    {
      key: "status",
      header: "Status",
      width: "9rem",
      render: (a) =>
        canManage ? (
          <AccountStatusSelect accountId={a.id} accountLabel={a.label} status={a.status} canManage={canManage} />
        ) : (
          <StatusBadge kind="brokerAccount" value={a.status} size="xs" />
        ),
    },
    { key: "cashBalance", header: "Cash", align: "right", render: (a) => formatMoney(a.cashBalance, a.currency, { compact: true }) },
    { key: "buyingPower", header: "Buying power", align: "right", render: (a) => formatMoney(a.buyingPower, a.currency, { compact: true }) },
    { key: "marginUsed", header: "Margin used", align: "right", render: (a) => formatMoney(a.marginUsed, a.currency, { compact: true }) },
    {
      key: "lastHeartbeatAt",
      header: "Heartbeat",
      align: "right",
      render: (a) => <span className="text-fg-subtle">{a.lastHeartbeatAt ? formatRelative(a.lastHeartbeatAt, now) : "—"}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "7rem",
      render: (a) => (
        <ActionButton
          path={`/api/brokers/accounts/${a.id}/reconcile`}
          label="Reconcile"
          size="xs"
          icon={<RefreshIcon size={12} />}
          disabled={!canManage}
          disabledReason="Requires brokers:manage"
          successTitle="Account reconciled"
          successDescription={`${a.label} balances and positions pulled from the broker.`}
        />
      ),
    },
  ];
}

/** Linked accounts for a single broker. */
export function AccountsTable(props: AccountsTableProps) {
  return (
    <DataTable
      columns={makeColumns(props)}
      rows={props.accounts}
      rowKey={(a) => a.id}
      caption={`Accounts linked to ${props.brokerName}`}
      emptyTitle="No linked accounts"
      emptyDescription={`No portfolio is funded through ${props.brokerName} yet.`}
    />
  );
}
