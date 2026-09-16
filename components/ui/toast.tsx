"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import type { Tone } from "@/lib/ui/status";
import { TONE_DOT } from "@/components/ui/badge";
import { CloseIcon } from "@/components/icons";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
  durationMs: number;
}

export interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  durationMs?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current;
      const toast: Toast = { id, title: input.title, description: input.description, tone: input.tone ?? "neutral", durationMs: input.durationMs ?? 5000 };
      setToasts((ts) => [...ts.slice(-4), toast]);
      if (toast.durationMs > 0) timers.current.set(id, setTimeout(() => dismiss(id), toast.durationMs));
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            data-tone={t.tone}
            className="pointer-events-auto panel flex items-start gap-2.5 px-3 py-2.5 animate-[ap-toast-in_160ms_ease-out]"
          >
            <span className={cn("mt-1.5 size-2 rounded-full shrink-0", TONE_DOT[t.tone])} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">{t.title}</p>
              {t.description ? <p className="text-xs text-fg-muted mt-0.5 break-words">{t.description}</p> : null}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-fg-subtle hover:text-fg rounded p-0.5">
              <CloseIcon size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
