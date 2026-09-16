import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { formatPct, signOf } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { TONE_TEXT } from "@/components/ui/badge";

export interface StatTileProps {
  label: string;
  /** Pre-formatted value (use lib/ui/format). */
  value: ReactNode;
  /** Numeric delta; sign drives colour. Rendered via `deltaFormat` or as a percentage fraction by default. */
  delta?: number | null;
  deltaLabel?: string;
  deltaFormat?: (d: number) => string;
  /** Colour the main value itself by sign (for P&L tiles). */
  valueTone?: Tone;
  hint?: ReactNode;
  href?: string;
  icon?: ReactNode;
  /** Right-hand slot e.g. a Sparkline. */
  aside?: ReactNode;
  className?: string;
}

export function StatTile({ label, value, delta, deltaLabel, deltaFormat, valueTone = "neutral", hint, href, icon, aside, className }: StatTileProps) {
  const sign = signOf(delta);
  const deltaTone: Tone = sign === "pos" ? "positive" : sign === "neg" ? "negative" : "muted";
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps truncate">{label}</span>
        {icon ? <span className="text-fg-subtle">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3 mt-1.5">
        <div className="min-w-0">
          <div data-testid="stat-value" className={cn("num text-xl leading-none font-medium tracking-tight truncate", TONE_TEXT[valueTone])}>
            {value}
          </div>
          {delta !== undefined && delta !== null ? (
            <div data-testid="stat-delta" data-sign={sign} className={cn("num mt-1.5 text-xs flex items-center gap-1", TONE_TEXT[deltaTone])}>
              <span aria-hidden="true">{sign === "pos" ? "▲" : sign === "neg" ? "▼" : "•"}</span>
              <span>{deltaFormat ? deltaFormat(delta) : formatPct(delta, { sign: true })}</span>
              {deltaLabel ? <span className="text-fg-subtle font-sans">{deltaLabel}</span> : null}
            </div>
          ) : hint ? (
            <div className="mt-1.5 text-xs text-fg-subtle truncate">{hint}</div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-fg-subtle">{aside}</div> : null}
      </div>
    </>
  );
  const classes = cn("panel px-4 py-3 flex flex-col min-w-0", href && "hover:border-edge-strong transition-colors", className);
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
