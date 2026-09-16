import { EmptyState } from "@/components/ui/empty-state";
import { PageGuard } from "@/app/(app)/_components/guard";
import { loadNow, loadPortfolioIndex } from "@/app/(app)/_lib/data";
import type { BrokerAccount } from "@/lib/domain/portfolio";
import { loadBrokerAccounts, loadBrokers, loadCanManage } from "./data";
import { BrokerCard } from "./broker-card";

/** Every connected venue, each with its capabilities, health and accounts. */
export async function BrokerList() {
  const [brokers, accounts, portfolios, canManage, now] = await Promise.all([
    loadBrokers(),
    loadBrokerAccounts(),
    loadPortfolioIndex(),
    loadCanManage(),
    loadNow(),
  ]);

  const accountsByBroker = new Map<string, BrokerAccount[]>();
  if (accounts.ok) {
    for (const account of accounts.value.items) {
      const list = accountsByBroker.get(account.broker) ?? [];
      list.push(account);
      accountsByBroker.set(account.broker, list);
    }
  }

  return (
    <PageGuard result={brokers} what="broker connectivity">
      {(entries) =>
        entries.length === 0 ? (
          <EmptyState
            title="No brokers connected"
            description="No venue adapter is registered, or the platform has not been seeded yet."
          />
        ) : (
          <div className="grid gap-4 2xl:grid-cols-2">
            {entries.map((entry) => (
              <BrokerCard
                key={entry.capabilities.broker}
                capabilities={entry.capabilities}
                health={entry.health}
                accountCount={entry.accountCount}
                accounts={accountsByBroker.get(entry.capabilities.broker) ?? []}
                portfolios={portfolios}
                canManage={canManage}
                now={now}
              />
            ))}
          </div>
        )
      }
    </PageGuard>
  );
}
