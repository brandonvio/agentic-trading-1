"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { Button } from "@/components/ui/button";
import { Label, Select, fieldClasses } from "@/components/ui/form";
import { SearchIcon } from "@/components/icons";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  /** Search-param name. */
  name: string;
  label: string;
  /** Current value, read from `await searchParams` by the page. */
  value?: string;
  options: FilterOption[];
  /** Label for the "no filter" option. */
  allLabel?: string;
  className?: string;
}

export interface SearchDef {
  name: string;
  value?: string;
  label?: string;
  placeholder?: string;
}

export interface FilterBarProps {
  /** Route the filters live on, e.g. "/orders". */
  basePath: string;
  filters?: FilterDef[];
  search?: SearchDef;
  /** Extra params kept across filter changes (e.g. the active tab). */
  preserve?: Record<string, string | undefined>;
  actions?: ReactNode;
  className?: string;
}

/**
 * URL-driven filter row. Selects navigate immediately; the search box submits
 * on Enter. Every control is labelled, and the whole row is a `<search>`
 * landmark so it is reachable by assistive tech.
 */
export function FilterBar({ basePath, filters = [], search, preserve, actions, className }: FilterBarProps) {
  const router = useRouter();
  const [text, setText] = useState(search?.value ?? "");

  function navigate(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const current: Record<string, string | undefined> = { ...preserve };
    for (const f of filters) current[f.name] = f.value;
    if (search) current[search.name] = search.value;
    for (const [k, v] of Object.entries({ ...current, ...overrides })) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search) navigate({ [search.name]: text.trim() });
  }

  const active = filters.some((f) => f.value) || Boolean(search?.value);

  return (
    <search className={cn("panel flex flex-wrap items-end gap-3 px-4 py-3", className)}>
      {search ? (
        <form onSubmit={onSubmit} role="search" className="min-w-0 flex-1 max-w-xs">
          <Label htmlFor={`filter-${search.name}`}>{search.label ?? "Search"}</Label>
          <div className="relative">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              id={`filter-${search.name}`}
              name={search.name}
              type="search"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={search.placeholder ?? "Search…"}
              className={fieldClasses("pl-8")}
            />
          </div>
        </form>
      ) : null}

      {filters.map((f) => (
        <div key={f.name} className={cn("min-w-0", f.className ?? "w-44")}>
          <Label htmlFor={`filter-${f.name}`}>{f.label}</Label>
          <Select
            id={`filter-${f.name}`}
            name={f.name}
            value={f.value ?? ""}
            onChange={(e) => navigate({ [f.name]: e.target.value })}
            options={[{ value: "", label: f.allLabel ?? `All ${f.label.toLowerCase()}` }, ...f.options]}
          />
        </div>
      ))}

      <div className="flex items-center gap-2 pb-px ml-auto">
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText("");
              const params = new URLSearchParams();
              for (const [k, v] of Object.entries(preserve ?? {})) if (v) params.set(k, v);
              const qs = params.toString();
              router.push(qs ? `${basePath}?${qs}` : basePath);
            }}
          >
            Clear
          </Button>
        ) : null}
        {actions}
      </div>
    </search>
  );
}
