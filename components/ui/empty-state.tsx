import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { InfoIcon } from "@/components/icons";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: "neutral" | "warning" | "negative";
  className?: string;
}

export function EmptyState({ title, description, icon, action, compact = false, tone = "neutral", className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center gap-1.5 rounded-md border border-dashed",
        compact ? "py-6 px-4" : "py-12 px-6",
        tone === "warning" ? "border-warning/30" : tone === "negative" ? "border-negative/30" : "border-edge-strong",
        className,
      )}
    >
      <span className={cn("mb-1", tone === "warning" ? "text-warning" : tone === "negative" ? "text-negative" : "text-fg-subtle")}>
        {icon ?? <InfoIcon size={compact ? 16 : 20} />}
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="text-xs text-fg-muted max-w-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Standard "you can't see this" block for permission-gated sections. */
export function NotPermitted({ what = "this section", compact = true }: { what?: string; compact?: boolean }) {
  return <EmptyState compact={compact} tone="warning" title="Not permitted" description={`Your role does not grant access to ${what}.`} />;
}
