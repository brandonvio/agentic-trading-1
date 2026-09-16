"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { useCan } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PencilIcon, PlusIcon } from "@/components/icons";
import type { RiskLimit } from "@/lib/domain/risk";
import type { FilterOption } from "../../_components/filters";
import { ActionButton } from "../../_components/action-button";
import { ACTION_OPTIONS, METRIC_OPTIONS, SCOPE_OPTIONS, fromFormValue, metricInputSuffix, qualifierHint, toFormValue } from "./metrics";

export interface ScopeOptions {
  portfolios: FilterOption[];
  desks: FilterOption[];
}

interface FormState {
  name: string;
  scope: RiskLimit["scope"];
  scopeId: string;
  metric: RiskLimit["metric"];
  qualifier: string;
  threshold: string;
  warnThreshold: string;
  action: RiskLimit["action"];
  enabled: boolean;
}

function initialState(limit: RiskLimit | null): FormState {
  if (!limit) {
    return {
      name: "",
      scope: "portfolio",
      scopeId: "",
      metric: "gross_exposure_pct_nav",
      qualifier: "",
      threshold: "",
      warnThreshold: "",
      action: "warn",
      enabled: true,
    };
  }
  return {
    name: limit.name,
    scope: limit.scope,
    scopeId: limit.scopeId ?? "",
    metric: limit.metric,
    qualifier: limit.qualifier ?? "",
    threshold: toFormValue(limit.metric, limit.threshold),
    warnThreshold: toFormValue(limit.metric, limit.warnThreshold),
    action: limit.action,
    enabled: limit.enabled,
  };
}

function LimitDrawer({ limit, options, open, onClose }: { limit: RiskLimit | null; options: ScopeOptions; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<FormState>(() => initialState(limit));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const suffix = metricInputSuffix(form.metric);
  const hint = qualifierHint(form.metric);
  const needsScopeId = form.scope !== "platform";
  const scopeChoices = form.scope === "portfolio" ? options.portfolios : form.scope === "desk" ? options.desks : null;
  const thresholdValue = fromFormValue(form.metric, form.threshold);
  const invalid = form.name.trim() === "" || thresholdValue === null || (needsScopeId && form.scopeId.trim() === "");

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        scope: form.scope,
        scopeId: needsScopeId ? form.scopeId.trim() : null,
        metric: form.metric,
        qualifier: form.qualifier.trim() === "" ? null : form.qualifier.trim(),
        threshold: thresholdValue ?? 0,
        warnThreshold: fromFormValue(form.metric, form.warnThreshold),
        action: form.action,
        enabled: form.enabled,
      };
      if (limit) await apiFetch(`/api/risk/limits/${limit.id}`, { method: "PATCH", body: payload });
      else await apiFetch("/api/risk/limits", { method: "POST", body: payload });
      push({ title: limit ? "Limit updated" : "Limit created", description: payload.name, tone: "positive" });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => (pending ? undefined : onClose())}
      title={limit ? `Edit ${limit.name}` : "New risk limit"}
      description="Percentage metrics are entered as percentages and stored as fractions."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={pending} disabled={invalid} onClick={() => void submit()}>
            {limit ? "Save limit" : "Create limit"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="limit-name">
          <Input id="limit-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Gross leverage ceiling" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scope" htmlFor="limit-scope">
            <Select
              id="limit-scope"
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as RiskLimit["scope"], scopeId: "" }))}
              options={SCOPE_OPTIONS}
            />
          </Field>
          <Field
            label="Scope target"
            htmlFor="limit-scope-id"
            help={needsScopeId ? undefined : "Platform limits apply everywhere."}
          >
            {scopeChoices ? (
              <Select
                id="limit-scope-id"
                value={form.scopeId}
                onChange={(e) => set("scopeId", e.target.value)}
                placeholder={`Select a ${form.scope}`}
                options={scopeChoices}
              />
            ) : (
              <Input
                id="limit-scope-id"
                value={form.scopeId}
                onChange={(e) => set("scopeId", e.target.value)}
                disabled={!needsScopeId}
                mono
                placeholder={needsScopeId ? `${form.scope} id` : "—"}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Metric" htmlFor="limit-metric">
            <Select id="limit-metric" value={form.metric} onChange={(e) => set("metric", e.target.value as RiskLimit["metric"])} options={METRIC_OPTIONS} />
          </Field>
          <Field label="Qualifier" htmlFor="limit-qualifier" help={hint ?? "Not used by this metric."}>
            <Input id="limit-qualifier" value={form.qualifier} onChange={(e) => set("qualifier", e.target.value)} disabled={hint === null} mono />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Threshold" htmlFor="limit-threshold" hint={suffix} help="Loss and drawdown limits are compared as magnitudes.">
            <Input id="limit-threshold" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} inputMode="decimal" mono placeholder="0" />
          </Field>
          <Field label="Warn threshold" htmlFor="limit-warn" hint={suffix} help="Optional soft level that raises a warning first.">
            <Input id="limit-warn" value={form.warnThreshold} onChange={(e) => set("warnThreshold", e.target.value)} inputMode="decimal" mono placeholder="—" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Action on breach" htmlFor="limit-action">
            <Select id="limit-action" value={form.action} onChange={(e) => set("action", e.target.value as RiskLimit["action"])} options={ACTION_OPTIONS} />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-fg">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="size-3.5 rounded border border-edge-strong bg-surface-2 accent-[var(--accent)]"
              />
              Enabled
            </label>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-negative">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/** "New limit" affordance for the limits tab header. */
export function NewLimitButton({ options }: { options: ScopeOptions }) {
  const canWrite = useCan("risk:limits:write");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="primary" icon={<PlusIcon size={13} />} disabled={!canWrite} title={canWrite ? undefined : "Requires risk:limits:write"} onClick={() => setOpen(true)}>
        New limit
      </Button>
      {open ? <LimitDrawer key="new" limit={null} options={options} open onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Edit + delete for one limit row. */
export function LimitRowActions({ limit, options }: { limit: RiskLimit; options: ScopeOptions }) {
  const canWrite = useCan("risk:limits:write");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="xs" variant="ghost" icon={<PencilIcon size={13} />} disabled={!canWrite} title={canWrite ? undefined : "Requires risk:limits:write"} onClick={() => setOpen(true)}>
        Edit
      </Button>
      <ActionButton
        path={`/api/risk/limits/${limit.id}`}
        method="DELETE"
        label="Delete"
        size="xs"
        variant="danger"
        disabled={!canWrite}
        disabledReason="Requires risk:limits:write"
        confirmTitle={`Delete ${limit.name}?`}
        confirmDescription="The limit stops being evaluated immediately. Existing breaches are kept for the audit trail."
        confirmLabel="Delete limit"
        successTitle="Limit deleted"
      />
      {open ? <LimitDrawer key={limit.id} limit={limit} options={options} open onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
