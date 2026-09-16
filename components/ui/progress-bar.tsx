import { cn } from "@/lib/ui/cn";
import { formatPct } from "@/lib/ui/format";
import { toneForUtilization, type Tone } from "@/lib/ui/status";
import { TONE_DOT, TONE_TEXT } from "@/components/ui/badge";

export interface ProgressBarProps {
  /** 0..1 (values above 1 render full and are coloured as breach). */
  value: number;
  warnAt?: number;
  breachAt?: number;
  /** Force a tone instead of deriving from thresholds. */
  tone?: Tone;
  label?: string;
  showValue?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function ProgressBar({ value, warnAt = 0.8, breachAt = 1, tone, label, showValue = false, size = "sm", className }: ProgressBarProps) {
  const t = tone ?? toneForUtilization(value, warnAt, breachAt);
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const h = size === "xs" ? "h-1" : size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      {label ? <span className="text-xs text-fg-muted truncate shrink-0 w-24">{label}</span> : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        data-tone={t}
        className={cn("relative flex-1 rounded-full bg-surface-3 overflow-hidden", h)}
      >
        <div className={cn("h-full rounded-full transition-[width]", TONE_DOT[t])} style={{ width: `${pct * 100}%` }} />
        {warnAt > 0 && warnAt < 1 ? <span aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-bg/70" style={{ left: `${warnAt * 100}%` }} /> : null}
      </div>
      {showValue ? <span className={cn("num text-xs w-12 text-right shrink-0", TONE_TEXT[t])}>{formatPct(value, { decimals: 0 })}</span> : null}
    </div>
  );
}

/** Horizontal bar for composition charts (exposure by asset class). */
export function HBar({ label, value, max, format, tone = "accent", className }: { label: string; value: number; max: number; format: (v: number) => string; tone?: Tone; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, Math.abs(value) / max)) : 0;
  return (
    <div className={cn("grid grid-cols-[6rem_1fr_5.5rem] items-center gap-3 text-xs", className)}>
      <span className="text-fg-muted truncate">{label}</span>
      <div className="h-2 rounded-sm bg-surface-3 overflow-hidden" aria-hidden="true">
        <div className={cn("h-full rounded-sm", TONE_DOT[tone])} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="num text-right text-fg">{format(value)}</span>
    </div>
  );
}
