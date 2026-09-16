import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";

export type Align = "left" | "right" | "center";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: Align;
  /** Mono tabular numerals. Defaults to true for right-aligned columns. */
  mono?: boolean;
  width?: string;
  className?: string;
  render?: (row: Row, index: number) => ReactNode;
  /** Used when `render` is absent: reads row[key]. */
  accessor?: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  /** Makes the whole row a link (rendered as an overlay anchor, keeps cells text-selectable). */
  rowHref?: (row: Row) => string | null | undefined;
  rowClassName?: (row: Row) => string | undefined;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  caption?: string;
  dense?: boolean;
  /** Sticky header requires the wrapper to scroll; give it a max-height via className. */
  className?: string;
  /** Row count cap with a "+N more" footer link. */
  footer?: ReactNode;
}

const ALIGN: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

function cellValue<Row>(col: Column<Row>, row: Row, i: number): ReactNode {
  if (col.render) return col.render(row, i);
  if (col.accessor) return col.accessor(row);
  const v = (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined) return <span className="text-fg-subtle">—</span>;
  return String(v);
}

export function DataTable<Row>({ columns, rows, rowKey, rowHref, rowClassName, empty, emptyTitle, emptyDescription, caption, dense = true, className, footer }: DataTableProps<Row>) {
  if (rows.length === 0) {
    return <div className="p-6">{empty ?? <EmptyState title={emptyTitle ?? "Nothing here"} description={emptyDescription} compact />}</div>;
  }
  const py = dense ? "py-1.5" : "py-2.5";
  return (
    <div className={cn("relative overflow-auto min-w-0", className)}>
      <table className="w-full border-collapse text-xs">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr className="border-b border-edge">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn("label-caps font-medium px-3 h-8 whitespace-nowrap", ALIGN[c.align ?? "left"], c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row, i)}
                className={cn("relative border-b border-edge/60 last:border-b-0 hover:bg-surface-2 transition-colors", href && "cursor-pointer", rowClassName?.(row))}
              >
                {columns.map((c, ci) => {
                  const right = (c.align ?? "left") === "right";
                  return (
                    <td key={c.key} className={cn("px-3 align-middle whitespace-nowrap", py, ALIGN[c.align ?? "left"], (c.mono ?? right) && "num", c.className)}>
                      {ci === 0 && href ? (
                        <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring">
                          {cellValue(c, row, i)}
                        </Link>
                      ) : (
                        cellValue(c, row, i)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer ? <div className="px-3 py-2 border-t border-edge text-xs text-fg-subtle">{footer}</div> : null}
    </div>
  );
}
