"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { useCan } from "@/components/providers/session-provider";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PlayIcon } from "@/components/icons";
import { formatMoney, formatNumber, humanize } from "@/lib/ui/format";
import type { AgentRun } from "@/lib/domain/agent";

export interface RunAgentButtonProps {
  agentId: string;
  agentName: string;
  /** Disabled for paused/disabled agents and for roles without `agents:run`. */
  agentStatus: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  label?: string;
}

/**
 * Triggers a synchronous agent run and reports the finished run in a toast:
 * status, steps, signals/orders produced and LLM cost.
 */
export function RunAgentButton({ agentId, agentName, agentStatus, size = "xs", variant = "secondary", label = "Run" }: RunAgentButtonProps) {
  const canRun = useCan("agents:run");
  const router = useRouter();
  const { push } = useToast();
  const [pending, setPending] = useState(false);

  const blocked = agentStatus === "disabled" || agentStatus === "paused";
  const disabled = !canRun || blocked || pending;
  const reason = !canRun ? "Requires the agents:run permission" : blocked ? `Agent is ${agentStatus}` : undefined;

  async function run() {
    setPending(true);
    try {
      const finished = await apiFetch<AgentRun>(`/api/agents/${agentId}/run`, { method: "POST", body: {} });
      push({
        title: `${agentName} · ${humanize(finished.status)}`,
        description: `${formatNumber(finished.stepCount)} steps · ${finished.signalIds.length} signals · ${finished.orderIds.length} orders · ${formatMoney(finished.costUsd, "USD", { decimals: 4 })}`,
        tone: finished.status === "succeeded" ? "positive" : finished.status === "failed" ? "negative" : "warning",
      });
      router.refresh();
    } catch (e) {
      push({ title: `${agentName} run failed`, description: e instanceof ApiClientError ? e.message : "Request failed", tone: "negative" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size={size} variant={variant} icon={<PlayIcon size={12} />} loading={pending} disabled={disabled} title={reason} onClick={() => void run()}>
      {label}
    </Button>
  );
}
