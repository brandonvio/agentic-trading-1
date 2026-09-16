"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Shared behaviour for Drawer/Modal: Escape closes, focus moves into the
 * panel on open and returns on close, background is inert via aria-modal, and
 * clicking the backdrop dismisses. Rendered inline (no portal) — layouts keep
 * the shell below `z-40`.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    (focusable ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);
  return panelRef;
}

function OverlayFrame({ open, onClose, title, description, children, footer, className, variant }: OverlayProps & { variant: "drawer" | "modal" }) {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  const descId = useId();
  if (!open) return null;
  return (
    <div className={cn("fixed inset-0 z-50 flex", variant === "drawer" ? "justify-end" : "items-center justify-center p-4")}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex flex-col bg-surface-1 border-edge-strong shadow-2xl outline-none",
          variant === "drawer" ? "h-full w-full max-w-xl border-l" : "w-full max-w-lg rounded-lg border max-h-[calc(100vh-2rem)]",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-edge shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-xs text-fg-muted mt-0.5">
                {description}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="xs" aria-label="Close" onClick={onClose} icon={<CloseIcon size={14} />} />
        </header>
        <div className="flex-1 overflow-auto p-4 min-h-0">{children}</div>
        {footer ? <footer className="px-4 py-3 border-t border-edge flex items-center justify-end gap-2 shrink-0">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Drawer(props: OverlayProps) {
  return <OverlayFrame {...props} variant="drawer" />;
}

export function Modal(props: OverlayProps) {
  return <OverlayFrame {...props} variant="modal" />;
}
