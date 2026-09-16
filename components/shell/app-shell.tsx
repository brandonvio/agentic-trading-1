import type { ReactNode } from "react";
import { SessionProvider, type SessionValue } from "@/components/providers/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import { Sidebar } from "./sidebar";
import { Topbar, type BrokerHealthSummary } from "./topbar";

export interface AppShellProps {
  session: SessionValue;
  brokers: BrokerHealthSummary[] | null;
  pendingApprovals: number | null;
  children: ReactNode;
}

/** Authenticated chrome: session context, sidebar, topbar and the main region. */
export function AppShell({ session, brokers, pendingApprovals, children }: AppShellProps) {
  return (
    <SessionProvider value={session}>
      <ToastProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-edge-strong focus:bg-surface-2 focus:px-3 focus:py-1.5 focus:text-xs"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh w-full">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar brokers={brokers} pendingApprovals={pendingApprovals} />
            <main id="main" className="min-w-0 flex-1 px-5 py-5">
              {children}
            </main>
          </div>
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
