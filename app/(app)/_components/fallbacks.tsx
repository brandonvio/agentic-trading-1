import { Skeleton, SkeletonTable, SkeletonText } from "@/components/ui/skeleton";

/** Card-shaped Suspense fallback matching the real sections' chrome. */
export function CardSkeleton({ rows = 5, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`panel ${className ?? ""}`} aria-hidden="true">
      <div className="flex h-10 items-center border-b border-edge px-4">
        <Skeleton className="h-2.5 w-24" />
      </div>
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  );
}

/** Bare table fallback for a section that already sits inside a card. */
export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return <SkeletonTable rows={rows} cols={cols} />;
}

export function StripSkeleton() {
  return (
    <div className="panel flex items-center gap-4 px-4 py-3" aria-hidden="true">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-3 flex-1 max-w-md" />
      <Skeleton className="h-3 w-64" />
    </div>
  );
}

/** Prose/detail fallback for description panels. */
export function DetailSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel p-4" aria-hidden="true">
      <Skeleton className="mb-3 h-2.5 w-24" />
      <SkeletonText lines={lines} />
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel space-y-3 px-4 py-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}
