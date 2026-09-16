/** Compact wall-clock duration between two ISO timestamps: "1.4s", "2m 10s", "1h 05m". */
export function formatDuration(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return "—";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  return formatMillis(Math.max(0, end - start));
}

export function formatMillis(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}
