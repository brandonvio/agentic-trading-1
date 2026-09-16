"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { BrokerAccountStatus } from "@/lib/domain/portfolio";

const OPTIONS = BrokerAccountStatus.options.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export interface AccountStatusSelectProps {
  accountId: string;
  accountLabel: string;
  status: string;
  canManage: boolean;
}

/** Inline connection-status control for one broker account (brokers:manage). */
export function AccountStatusSelect({ accountId, accountLabel, status, canManage }: AccountStatusSelectProps) {
  const router = useRouter();
  const { push } = useToast();
  const [value, setValue] = useState(status);
  const [pending, setPending] = useState(false);
  const selectId = `account-status-${accountId}`;

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setPending(true);
    try {
      await apiFetch(`/api/brokers/accounts/${accountId}`, { method: "PATCH", body: { status: next } });
      push({ title: "Status updated", description: `${accountLabel} is now ${next}.`, tone: "positive" });
      router.refresh();
    } catch (e) {
      setValue(previous);
      push({
        title: "Status change failed",
        description: e instanceof ApiClientError ? e.message : "Request failed",
        tone: "negative",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <label htmlFor={selectId} className="sr-only">
        Connection status for {accountLabel}
      </label>
      <Select
        id={selectId}
        value={value}
        disabled={!canManage || pending}
        title={canManage ? undefined : "Requires brokers:manage"}
        onChange={(e) => void change(e.target.value)}
        options={OPTIONS}
        className="w-32 text-xs"
      />
    </>
  );
}
