"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/ui/format";
import { ClockIcon } from "@/components/icons";

const ZONES: Array<{ label: string; timeZone: string }> = [
  { label: "UTC", timeZone: "UTC" },
  { label: "NY", timeZone: "America/New_York" },
];

/**
 * One shared 1s ticker for every clock on screen. `getSnapshot` returns a
 * cached timestamp so React can compare snapshots; the server snapshot is null
 * so the markup hydrates from a stable placeholder.
 */
const listeners = new Set<() => void>();
let currentTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeTick(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    currentTick = Date.now();
    timer = setInterval(() => {
      currentTick = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getTick(): number {
  if (currentTick === 0) currentTick = Date.now();
  return currentTick;
}

function getServerTick(): number | null {
  return null;
}

export function Clock() {
  const tick = useSyncExternalStore(subscribeTick, getTick, getServerTick);
  const now = tick === null ? null : new Date(tick);

  return (
    <div className="hidden lg:flex items-center gap-3 text-2xs text-fg-muted" aria-label="Current time">
      <ClockIcon size={13} className="text-fg-subtle" />
      {ZONES.map((zone) => (
        <span key={zone.label} className="flex items-baseline gap-1">
          <span className="text-fg-subtle">{zone.label}</span>
          <time className="num tabular-nums text-fg" suppressHydrationWarning dateTime={now?.toISOString()}>
            {now ? formatDateTime(now, { timeZone: zone.timeZone, style: "time", seconds: true }) : "--:--:--"}
          </time>
        </span>
      ))}
    </div>
  );
}
