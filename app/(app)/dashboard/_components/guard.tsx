import type { ReactNode } from "react";
import { isForbidden, type SafeResult } from "@/lib/ui/safe";
import { EmptyState, NotPermitted } from "@/components/ui/empty-state";

/**
 * Renders `children(value)` on success; a "Not permitted" block when the role
 * lacks the permission; a quiet failure block for anything else.
 */
export function Guard<T>({ result, what, children }: { result: SafeResult<T>; what: string; children: (value: T) => ReactNode }) {
  if (result.ok) return <>{children(result.value)}</>;
  return (
    <div className="p-4">
      {isForbidden(result) ? (
        <NotPermitted what={what} />
      ) : (
        <EmptyState compact tone="negative" title="Unavailable" description={result.error.message} />
      )}
    </div>
  );
}
