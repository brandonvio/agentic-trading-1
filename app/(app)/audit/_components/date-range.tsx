"use client";

import { useRouter } from "next/navigation";
import { Label, fieldClasses } from "@/components/ui/form";

export interface DateRangeProps {
  basePath: string;
  /** Current search params to preserve when the range changes. */
  params: Record<string, string | undefined>;
  from?: string;
  to?: string;
}

/**
 * From/to day pickers that write `?from=&to=` (YYYY-MM-DD) while preserving the
 * other filters. Complements FilterBar, which only knows selects and search.
 */
export function DateRange({ basePath, params, from, to }: DateRangeProps) {
  const router = useRouter();

  function navigate(next: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, from, to, ...next })) {
      if (v !== undefined && v !== "") search.set(k, v);
    }
    const qs = search.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="flex items-end gap-2">
      <div className="w-36">
        <Label htmlFor="audit-from">From</Label>
        <input
          id="audit-from"
          type="date"
          value={from ?? ""}
          max={to}
          onChange={(e) => navigate({ from: e.target.value })}
          className={fieldClasses("num")}
        />
      </div>
      <div className="w-36">
        <Label htmlFor="audit-to">To</Label>
        <input
          id="audit-to"
          type="date"
          value={to ?? ""}
          min={from}
          onChange={(e) => navigate({ to: e.target.value })}
          className={fieldClasses("num")}
        />
      </div>
    </div>
  );
}
