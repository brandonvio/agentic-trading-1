"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Modal } from "@/components/ui/drawer";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface ActionButtonProps {
  /** API path, e.g. `/api/orders/abc/cancel`. */
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  /** Static JSON body merged with the collected reason, when any. */
  body?: Record<string, unknown>;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Rendered disabled with `title={disabledReason}` — used for permission gating. */
  disabled?: boolean;
  disabledReason?: string;
  /** Ask for free text before sending and put it in the body under this key. */
  reasonKey?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  /** Confirmation dialog copy. A modal is shown when this or `reasonKey` is set. */
  confirmTitle?: string;
  confirmDescription?: string;
  confirmLabel?: string;
  successTitle: string;
  successDescription?: string;
}

/**
 * Client mutation button for server-rendered pages: POSTs through `apiFetch`,
 * optionally collecting a rationale in a modal first, then toasts the outcome
 * and refreshes the server components on the page.
 */
export function ActionButton({
  path,
  method = "POST",
  body,
  label,
  variant = "secondary",
  size = "sm",
  icon,
  disabled = false,
  disabledReason,
  reasonKey,
  reasonLabel = "Rationale",
  reasonPlaceholder = "Why are you doing this?",
  reasonRequired = true,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  successTitle,
  successDescription,
}: ActionButtonProps) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsModal = Boolean(reasonKey || confirmTitle);
  const invalid = Boolean(reasonKey) && reasonRequired && reason.trim().length === 0;

  async function send() {
    setPending(true);
    setError(null);
    try {
      const payload = { ...(body ?? {}), ...(reasonKey ? { [reasonKey]: reason.trim() } : {}) };
      await apiFetch(path, { method, body: method === "DELETE" ? undefined : payload });
      push({ title: successTitle, description: successDescription, tone: "positive" });
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      const message = e instanceof ApiClientError ? e.message : "Request failed";
      setError(message);
      if (!needsModal) push({ title: `${label} failed`, description: message, tone: "negative" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={icon}
        loading={pending && !open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => (needsModal ? setOpen(true) : void send())}
      >
        {label}
      </Button>
      {needsModal ? (
        <Modal
          open={open}
          onClose={() => (pending ? undefined : setOpen(false))}
          title={confirmTitle ?? label}
          description={confirmDescription}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant={variant === "danger" ? "danger" : "primary"} size="sm" loading={pending} disabled={invalid} onClick={() => void send()}>
                {confirmLabel ?? label}
              </Button>
            </>
          }
        >
          {reasonKey ? (
            <Field
              label={reasonLabel}
              htmlFor={`action-reason-${reasonKey}-${path}`}
              error={error}
              help={reasonRequired ? "Recorded on the audit trail." : "Optional; recorded on the audit trail."}
            >
              <Textarea
                id={`action-reason-${reasonKey}-${path}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={4}
                required={reasonRequired}
              />
            </Field>
          ) : error ? (
            <p role="alert" className="text-xs text-negative">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
