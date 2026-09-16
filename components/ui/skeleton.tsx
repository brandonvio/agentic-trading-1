import { cn } from "@/lib/ui/cn";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn(
        "rounded bg-surface-3 bg-[linear-gradient(90deg,transparent,var(--surface-4),transparent)] bg-[length:400px_100%] bg-no-repeat animate-[ap-shimmer_1.4s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-3 space-y-2" aria-hidden="true">
      <div className="flex gap-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ opacity: 1 - r * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel px-4 py-3 space-y-3">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}
