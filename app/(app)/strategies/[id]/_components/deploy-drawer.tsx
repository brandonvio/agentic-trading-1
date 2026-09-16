"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ArrowUpRightIcon } from "@/components/icons";
import { formatMoney } from "@/lib/ui/format";
import type { ApprovalRequest } from "@/lib/domain/approval";
import type { Strategy } from "@/lib/domain/strategy";

export interface PortfolioOption {
  id: string;
  label: string;
}

/** Deploys the strategy to a portfolio in paper or live mode. */
export function DeployDrawer({ strategyId, canDeploy, portfolios }: { strategyId: string; canDeploy: boolean; portfolios: PortfolioOption[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [capital, setCapital] = useState("5000000");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const allocatedCapital = Number(capital);
    if (!portfolioId || !Number.isFinite(allocatedCapital) || allocatedCapital < 0) {
      setError("Choose a portfolio and a non-negative allocation.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<{ strategy: Strategy; approval: ApprovalRequest | null }>(`/api/strategies/${strategyId}/deploy`, {
        method: "POST",
        body: { portfolioId, allocatedCapital, mode },
      });
      push({
        title: result.approval ? "Approval requested" : `Deployed to ${mode}`,
        description: result.approval
          ? `A four-eyes approval is pending for ${formatMoney(allocatedCapital, "USD", { compact: true })}.`
          : `${result.strategy.code} now runs in ${mode} with ${formatMoney(allocatedCapital, "USD", { compact: true })} allocated.`,
        tone: result.approval ? "warning" : "positive",
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const noPortfolios = portfolios.length === 0;

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<ArrowUpRightIcon size={12} />}
        disabled={!canDeploy}
        title={canDeploy ? undefined : "Requires the strategies:deploy permission"}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Deploy
      </Button>
      <Drawer
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Deploy strategy"
        description="Live deployments raise a four-eyes approval unless your role can override risk."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button form="deploy-form" type="submit" variant="primary" size="sm" loading={pending} disabled={noPortfolios}>
              Deploy
            </Button>
          </>
        }
      >
        <form id="deploy-form" onSubmit={submit} className="space-y-4">
          <Field
            label="Portfolio"
            htmlFor="deploy-portfolio"
            help={noPortfolios ? "No portfolio is visible to your role." : "Capital is allocated from this portfolio's NAV."}
          >
            <Select
              id="deploy-portfolio"
              value={portfolioId}
              onChange={(e) => setPortfolioId(e.target.value)}
              disabled={noPortfolios}
              placeholder={noPortfolios ? "No portfolios available" : undefined}
              options={portfolios.map((p) => ({ value: p.id, label: p.label }))}
            />
          </Field>
          <Field label="Allocated capital" htmlFor="deploy-capital">
            <Input id="deploy-capital" type="number" min={0} step={100000} value={capital} onChange={(e) => setCapital(e.target.value)} required mono />
          </Field>
          <Field label="Mode" htmlFor="deploy-mode" error={error} help="Paper trades route to the simulator; live routes to the broker adapters.">
            <Select
              id="deploy-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value === "live" ? "live" : "paper")}
              options={[
                { value: "paper", label: "Paper" },
                { value: "live", label: "Live" },
              ]}
            />
          </Field>
        </form>
      </Drawer>
    </>
  );
}
