import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

/** Card-shaped Suspense fallback matching the real sections' chrome. */
export function CardSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel" aria-hidden="true">
      <div className="flex h-10 items-center border-b border-edge px-4">
        <Skeleton className="h-2.5 w-24" />
      </div>
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  );
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
