"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { BoltIcon } from "@/components/icons";
import { formatNumber, formatPct } from "@/lib/ui/format";
import type { Backtest } from "@/lib/domain/strategy";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Runs a backtest over a chosen window; the mock engine returns synchronously. */
export function BacktestDrawer({ strategyId, canBacktest }: { strategyId: string; canBacktest: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [capital, setCapital] = useState("1000000");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDrawer() {
    // Defaults are computed on open so server and client markup never diverge.
    const now = new Date();
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 2);
    setFrom(isoDate(start));
    setTo(isoDate(now));
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const initialCapital = Number(capital);
    if (!from || !to || !Number.isFinite(initialCapital) || initialCapital <= 0) {
      setError("Provide a valid window and a positive initial capital.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const backtest = await apiFetch<Backtest>(`/api/strategies/${strategyId}/backtests`, { method: "POST", body: { from, to, initialCapital } });
      push({
        title: `Backtest ${backtest.status}`,
        description: backtest.stats
          ? `Sharpe ${formatNumber(backtest.stats.sharpe, { decimals: 2 })} · ${formatPct(backtest.stats.annualizedReturnPct / 100, { sign: true, decimals: 1 })} ann. · ${formatNumber(backtest.stats.tradeCount)} trades`
          : backtest.summary || undefined,
        tone: backtest.status === "completed" ? "positive" : backtest.status === "failed" ? "negative" : "info",
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<BoltIcon size={12} />}
        disabled={!canBacktest}
        title={canBacktest ? undefined : "Requires the research:backtest permission"}
        onClick={openDrawer}
      >
        Run backtest
      </Button>
      <Drawer
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Run backtest"
        description="Replays the strategy over the chosen window against the mock market simulator."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button form="backtest-form" type="submit" variant="primary" size="sm" loading={pending}>
              Run backtest
            </Button>
          </>
        }
      >
        <form id="backtest-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="backtest-from">
              <Input id="backtest-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required mono />
            </Field>
            <Field label="To" htmlFor="backtest-to">
              <Input id="backtest-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required mono />
            </Field>
          </div>
          <Field label="Initial capital" htmlFor="backtest-capital" help="Base currency of the strategy's desk." error={error}>
            <Input id="backtest-capital" type="number" min={1} step={1000} value={capital} onChange={(e) => setCapital(e.target.value)} required mono />
          </Field>
        </form>
      </Drawer>
    </>
  );
}
