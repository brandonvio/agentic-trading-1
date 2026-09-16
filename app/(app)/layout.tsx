import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { services } from "@/lib/container";
import { safe } from "@/lib/ui/safe";
import { AppShell } from "@/components/shell/app-shell";
import type { BrokerHealthSummary } from "@/components/shell/topbar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // Both are decorative: a role without brokers:read / approvals:read still
  // gets the full shell, just without those indicators.
  const [brokersResult, pendingResult] = await Promise.all([
    safe(() => services().brokers.listBrokers(session.principal)),
    safe(() => services().approvals.pendingCount(session.principal)),
  ]);

  const brokers: BrokerHealthSummary[] | null = brokersResult.ok
    ? brokersResult.value.map((entry) => ({
        broker: entry.health.broker,
        displayName: entry.capabilities.displayName,
        status: entry.health.status,
        latencyMs: entry.health.latencyMs,
        message: entry.health.message,
      }))
    : null;

  return (
    <AppShell session={session} brokers={brokers} pendingApprovals={pendingResult.ok ? pendingResult.value : null}>
      {children}
    </AppShell>
  );
}
