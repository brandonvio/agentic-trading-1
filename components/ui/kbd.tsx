import { cn } from "@/lib/ui/cn";

/** Keyboard hint: `<Kbd>⌘K</Kbd>` or `<Kbd keys={["g", "d"]} />`. */
export function Kbd({ children, keys, className }: { children?: React.ReactNode; keys?: string[]; className?: string }) {
  const parts = keys ?? (children !== undefined ? [children] : []);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {parts.map((k, i) => (
        <kbd
          key={i}
          className="num inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] px-1 rounded border border-edge-strong bg-surface-2 text-2xs text-fg-subtle shadow-[0_1px_0_var(--edge-strong)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
