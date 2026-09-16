"use client";

import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import { formatNumber } from "@/lib/ui/format";
import { toneFor } from "@/lib/ui/status";
import { TONE_DOT } from "@/components/ui/badge";
import { ApprovalsIcon } from "@/components/icons";
import { Clock } from "./clock";
import { GlobalSearch } from "./global-search";
import { UserMenu } from "./user-menu";

/** Serialisable slice of BrokerHealth the topbar needs. */
export interface BrokerHealthSummary {
  broker: string;
  displayName: string;
  status: string;
  latencyMs: number;
  message: string;
}

export interface TopbarProps {
  brokers: BrokerHealthSummary[] | null;
  pendingApprovals: number | null;
  /** Rendered in the environment badge, e.g. "MOCK · PAPER". */
  environment?: string;
}

function BrokerHealth({ brokers }: { brokers: BrokerHealthSummary[] }) {
  const degraded = brokers.filter((b) => b.status !== "connected" && b.status !== "paper").length;
  return (
    <div
      className="hidden md:flex items-center gap-1.5 h-6 rounded-md border border-edge bg-surface-2 px-2"
      title={brokers.map((b) => `${b.displayName}: ${b.status} (${formatNumber(b.latencyMs)}ms)`).join("\n")}
    >
      <span className="label-caps">Venues</span>
      <span className="flex items-center gap-1" role="img" aria-label={`${brokers.length - degraded} of ${brokers.length} venues connected`}>
        {brokers.map((b) => (
          <span key={b.broker} className={cn("size-1.5 rounded-full", TONE_DOT[toneFor("brokerAccount", b.status)])} />
        ))}
      </span>
    </div>
  );
}

export function Topbar({ brokers, pendingApprovals, environment = "MOCK · PAPER" }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-edge bg-bg/85 px-4 backdrop-blur">
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2.5">
        <span
          className="hidden sm:inline-flex items-center gap-1.5 h-6 rounded-md border border-warning/30 bg-warning/10 px-2 text-2xs font-medium tracking-wide text-warning"
          title="Simulated brokers and a mock LLM; no real capital is at risk."
        >
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          {environment}
        </span>

        {brokers && brokers.length > 0 ? <BrokerHealth brokers={brokers} /> : null}

        {pendingApprovals !== null ? (
          <Link
            href="/approvals"
            className={cn(
              "inline-flex items-center gap-1.5 h-6 rounded-md border px-2 text-2xs font-medium transition-colors",
              pendingApprovals > 0
                ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                : "border-edge bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            <ApprovalsIcon size={13} />
            <span className="num">{formatNumber(pendingApprovals)}</span>
            <span className="hidden lg:inline">pending</span>
          </Link>
        ) : null}

        <Clock />
        <UserMenu />
      </div>
    </header>
  );
}
