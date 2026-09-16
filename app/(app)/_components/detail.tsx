import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Definition grid for entity attributes. Values are tabular by default. */
export function DetailGrid({ children, className, cols = 3 }: { children: ReactNode; className?: string; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return <dl className={cn("grid gap-x-6 gap-y-3", grid, className)}>{children}</dl>;
}

export function DetailItem({ label, children, mono = true, className }: { label: ReactNode; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="label-caps">{label}</dt>
      <dd className={cn("mt-0.5 text-xs text-fg break-words", mono && "num")}>{children}</dd>
    </div>
  );
}

/** Long-form text block (thesis, rationale, summaries). */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-fg-muted whitespace-pre-wrap", className)}>{children}</p>;
}
