import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { ChevronRightIcon } from "@/components/icons";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Inline badges / meta next to the title. */
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, meta, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 mb-5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-fg-subtle">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <ChevronRightIcon size={12} className="text-fg-subtle/70" /> : null}
              {b.href ? (
                <Link href={b.href} className="hover:text-fg transition-colors">
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-fg-muted">
                  {b.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-semibold tracking-tight text-fg leading-tight">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1 text-xs text-fg-muted max-w-3xl">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Section heading inside a page (between cards). */
export function SectionHeading({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mt-6 mb-2", className)}>
      <h2 className="label-caps">{children}</h2>
      {actions}
    </div>
  );
}
