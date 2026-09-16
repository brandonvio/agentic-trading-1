"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SearchIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/kbd";
import { fieldClasses } from "@/components/ui/form";

/** Global instrument search. Submits to /market?search=… and binds ⌘K / Ctrl-K. */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/market?search=${encodeURIComponent(query)}` : "/market");
  }

  return (
    <form role="search" onSubmit={onSubmit} className="relative min-w-0 flex-1 max-w-md">
      <label htmlFor="global-search" className="sr-only">
        Search instruments
      </label>
      <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        id="global-search"
        ref={inputRef}
        name="search"
        type="search"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search instruments…"
        className={fieldClasses("pl-8 pr-12")}
      />
      <Kbd keys={["⌘", "K"]} className="absolute right-2 top-1/2 -translate-y-1/2" />
    </form>
  );
}
