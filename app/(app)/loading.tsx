import { Skeleton, SkeletonTable, SkeletonTiles } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-3 w-80" />
      </div>
      <SkeletonTiles count={8} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <SkeletonTable rows={6} cols={4} />
        </div>
        <div className="panel">
          <SkeletonTable rows={6} cols={4} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
