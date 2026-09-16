"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertIcon, RefreshIcon } from "@/components/icons";

export default function AppError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Next 16: re-fetches and re-renders the segment. */
  retry?: () => void;
  /** Legacy fallback: clears the boundary without re-fetching. */
  reset?: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error in route segment", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5 py-10">
      <div className="panel w-full max-w-lg p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-negative">
            <AlertIcon size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-fg">Something went wrong</h1>
            <p className="mt-1 text-xs text-fg-muted">
              This section failed to render. Your session is intact — retrying re-runs the request.
            </p>
            <p className="mt-3 rounded-md border border-edge bg-surface-2 p-2.5 text-2xs text-fg-muted break-words">
              <span className="num">{error.message || "Unknown error"}</span>
              {error.digest ? <span className="mt-1 block text-fg-subtle">digest: {error.digest}</span> : null}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="primary" size="sm" icon={<RefreshIcon size={13} />} onClick={() => (retry ?? reset)?.()}>
                Try again
              </Button>
              <ButtonLink href="/dashboard" size="sm" variant="secondary">
                Back to dashboard
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
