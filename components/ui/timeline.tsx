import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { formatDateTime, formatRelative } from "@/lib/ui/format";
import type { Tone } from "@/lib/ui/status";
import { TONE_DOT } from "@/components/ui/badge";

export interface TimelineEvent {
  id: string;
  at: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: Tone;
  meta?: ReactNode;
}

export interface TimelineProps {
  events: TimelineEvent[];
  /** Server-provided now (ms) for relative times. */
  now: number;
  className?: string;
  emptyText?: string;
}

export function Timeline({ events, now, className, emptyText = "No events yet." }: TimelineProps) {
  if (events.length === 0) return <p className="text-xs text-fg-subtle px-1 py-2">{emptyText}</p>;
  return (
    <ol className={cn("relative ml-2 border-l border-edge-strong", className)}>
      {events.map((e) => (
        <li key={e.id} className="relative pl-4 pb-4 last:pb-0">
          <span className={cn("absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-2 ring-surface-1", TONE_DOT[e.tone ?? "neutral"])} aria-hidden="true" />
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-medium text-fg min-w-0 truncate">{e.title}</div>
            <time dateTime={e.at} title={formatDateTime(e.at, { seconds: true })} className="num text-2xs text-fg-subtle shrink-0">
              {formatRelative(e.at, now)}
            </time>
          </div>
          {e.description ? <div className="mt-0.5 text-xs text-fg-muted">{e.description}</div> : null}
          {e.meta ? <div className="mt-1 flex items-center gap-2">{e.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}
