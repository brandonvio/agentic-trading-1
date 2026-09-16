import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  /** Route the tabs live on, e.g. "/orders". */
  basePath: string;
  /** searchParams key that holds the tab value. */
  param?: string;
  items: TabItem[];
  /** Currently active value (read from `await searchParams` in the page). */
  active: string | undefined;
  /** Other search params to preserve when switching tabs. */
  preserve?: Record<string, string | undefined>;
  ariaLabel?: string;
  className?: string;
}

/**
 * URL-driven tabs: each tab is a Link to `?{param}=value`. Server-safe, so a
 * page can `const { tab } = await searchParams` and render the right panel.
 */
export function Tabs({ basePath, param = "tab", items, active, preserve, ariaLabel = "Sections", className }: TabsProps) {
  const current = active ?? items[0]?.value;
  return (
    <nav aria-label={ariaLabel} className={cn("flex items-end gap-1 border-b border-edge overflow-x-auto", className)}>
      {items.map((t) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(preserve ?? {})) if (v) qs.set(k, v);
        qs.set(param, t.value);
        const isActive = t.value === current;
        return (
          <Link
            key={t.value}
            href={`${basePath}?${qs.toString()}`}
            aria-current={isActive ? "page" : undefined}
            aria-disabled={t.disabled || undefined}
            className={cn(
              "relative flex items-center gap-1.5 px-3 h-9 text-xs font-medium whitespace-nowrap -mb-px border-b-2 transition-colors",
              isActive ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
              t.disabled && "pointer-events-none opacity-50",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className={cn("num rounded px-1 text-2xs", isActive ? "bg-accent/20 text-accent-strong" : "bg-surface-3 text-fg-subtle")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
