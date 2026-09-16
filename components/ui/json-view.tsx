import { cn } from "@/lib/ui/cn";

export interface JsonViewProps {
  value: unknown;
  /** Collapsed by default when the JSON is longer than this many characters. */
  collapseOver?: number;
  label?: string;
  defaultOpen?: boolean;
  className?: string;
  maxHeight?: string;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return String(value);
  }
}

function tokenise(json: string): React.ReactNode[] {
  // Keys, strings, numbers, booleans/null — enough to make agent tool IO scannable.
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|(true|false|null)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) out.push(json.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <span key={i++} className={m[2] ? "text-accent-strong" : "text-positive"}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else if (m[3] !== undefined) {
      out.push(
        <span key={i++} className="text-cyan">
          {m[3]}
        </span>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <span key={i++} className="text-warning">
          {m[4]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

/**
 * Collapsible pretty-printed JSON using native <details>, so it works in
 * server components with zero JS. Used for agent tool inputs/outputs.
 */
export function JsonView({ value, collapseOver = 240, label = "JSON", defaultOpen, className, maxHeight = "24rem" }: JsonViewProps) {
  const json = stringify(value);
  const open = defaultOpen ?? json.length <= collapseOver;
  return (
    <details open={open} className={cn("group rounded-md border border-edge bg-surface-2 text-xs", className)}>
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-fg-muted hover:text-fg flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 text-fg-subtle">
          ▸
        </span>
        <span className="font-medium">{label}</span>
        <span className="num text-fg-subtle">{json.length.toLocaleString("en-US")} chars</span>
      </summary>
      <pre className="num overflow-auto px-3 py-2 border-t border-edge text-[11.5px] leading-[1.5] whitespace-pre" style={{ maxHeight }}>
        {tokenise(json)}
      </pre>
    </details>
  );
}
