"use client";

import { useEffect, useId, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/ui/cn";
import { formatSymbol, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { CloseIcon, SpinnerIcon } from "@/components/icons";
import type { Paged } from "@/lib/domain/common";
import type { Instrument } from "@/lib/domain/instrument";

export interface InstrumentSearchProps {
  value: Instrument | null;
  onSelect: (instrument: Instrument | null) => void;
  error?: string | null;
}

interface Results {
  term: string;
  items: Instrument[];
}

/** Debounced instrument lookup against /api/instruments?search=… as a combobox. */
export function InstrumentSearch({ value, onSelect, error }: InstrumentSearchProps) {
  const inputId = useId();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [fetched, setFetched] = useState<Results>({ term: "", items: [] });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const query = term.trim();

  useEffect(() => {
    const search = term.trim();
    if (value || search.length < 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const paged = await apiFetch<Paged<Instrument>>("/api/instruments", { query: { search, limit: 8 } });
        if (cancelled) return;
        setFetched({ term: search, items: paged.items });
        setFailed(null);
      } catch (e) {
        if (cancelled) return;
        setFetched({ term: search, items: [] });
        setFailed(e instanceof Error ? e.message : "Instrument search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, value]);

  // Results are derived, so a changed term never shows stale matches.
  const results = !value && query.length > 0 && fetched.term === query ? fetched.items : [];
  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1);
  const searched = fetched.term === query && !loading;

  if (value) {
    return (
      <Field label="Instrument" htmlFor={inputId} error={error}>
        <div id={inputId} className="flex items-center justify-between gap-2 rounded-md border border-edge bg-surface-2 px-2.5 py-1.5">
          <span className="min-w-0">
            <span className="num block truncate text-[13px] font-medium text-fg">{formatSymbol(value.symbol)}</span>
            <span className="block truncate text-2xs text-fg-subtle">{value.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge tone="muted" size="xs">
              {humanize(value.assetClass)}
            </Badge>
            <Button variant="ghost" size="xs" aria-label="Clear instrument" icon={<CloseIcon size={12} />} onClick={() => onSelect(null)} />
          </span>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Instrument" htmlFor={inputId} error={error ?? failed} help={error || failed ? undefined : "Search by symbol or name."}>
      <div className="relative">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={term}
          placeholder="AAPL, EUR/USD, BTC-USD…"
          onChange={(e) => {
            setTerm(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (Math.min(i, results.length - 1) + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (Math.min(i, results.length - 1) - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const picked = results[activeIndex];
              if (picked) onSelect(picked);
            }
          }}
        />
        {loading ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
            <SpinnerIcon size={14} />
          </span>
        ) : null}
      </div>
      {results.length > 0 ? (
        <ul id={listId} role="listbox" aria-label="Instrument results" className="mt-1 max-h-56 overflow-auto rounded-md border border-edge bg-surface-2">
          {results.map((instrument, i) => (
            <li key={instrument.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(instrument)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors",
                  i === activeIndex ? "bg-surface-3" : "hover:bg-surface-3",
                )}
              >
                <span className="min-w-0">
                  <span className="num block truncate text-xs font-medium text-fg">{formatSymbol(instrument.symbol)}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{instrument.name}</span>
                </span>
                <Badge tone="muted" size="xs">
                  {humanize(instrument.assetClass)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : query.length > 0 && searched && !failed ? (
        <p className="mt-1 text-xs text-fg-subtle">No instrument matches “{query}”.</p>
      ) : null}
    </Field>
  );
}
