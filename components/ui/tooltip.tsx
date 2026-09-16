import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * Minimal title-based tooltip: wraps children in a span carrying `title` and an
 * accessible description. No positioning engine; the native tooltip is the UX.
 */
export function Tooltip({ text, children, className, underline = false }: { text: string; children: ReactNode; className?: string; underline?: boolean }) {
  return (
    <span title={text} aria-label={text} className={cn("inline-flex items-center cursor-help", underline && "underline decoration-dotted decoration-fg-subtle underline-offset-2", className)}>
      {children}
    </span>
  );
}
