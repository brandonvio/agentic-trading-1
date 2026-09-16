import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { humanize } from "@/lib/ui/format";
import { toneFor, type StatusKind, type Tone } from "@/lib/ui/status";

export const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-edge-strong",
  muted: "bg-surface-2 text-fg-subtle border-edge",
  accent: "bg-accent/15 text-accent-strong border-accent/30",
  positive: "bg-positive/12 text-positive border-positive/30",
  negative: "bg-negative/12 text-negative border-negative/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  info: "bg-info/12 text-info border-info/30",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-neutral",
  muted: "bg-fg-subtle",
  accent: "bg-accent",
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  info: "bg-info",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg",
  muted: "text-fg-subtle",
  accent: "text-accent-strong",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  info: "text-info",
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  size?: "xs" | "sm";
  dot?: boolean;
  mono?: boolean;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", children, size = "sm", dot = false, mono = false, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium whitespace-nowrap align-middle",
        size === "xs" ? "h-4 px-1 text-2xs" : "h-5 px-1.5 text-2xs",
        mono && "num",
        TONE_BADGE[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full shrink-0", TONE_DOT[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export interface StatusBadgeProps {
  kind: StatusKind;
  value: string | null | undefined;
  size?: "xs" | "sm";
  dot?: boolean;
  className?: string;
  /** Override label; defaults to humanised value. */
  label?: string;
}

/** Badge coloured by lib/ui/status maps: `<StatusBadge kind="order" value={order.status} />` */
export function StatusBadge({ kind, value, size, dot = true, className, label }: StatusBadgeProps) {
  const tone = toneFor(kind, value);
  const pulse = value === "running";
  return (
    <Badge tone={tone} size={size} dot={dot} className={cn(pulse && "[&>span:first-child]:animate-pulse", className)} title={value ?? undefined}>
      {label ?? (kind === "order" || kind === "side" || kind === "direction" ? (value ?? "—") : humanize(value))}
    </Badge>
  );
}

/** Small coloured dot with accessible label, for health indicators. */
export function StatusDot({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label}>
      <span className={cn("size-2 rounded-full shrink-0", TONE_DOT[tone])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
