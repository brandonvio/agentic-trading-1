import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes inner padding so tables can run edge to edge. */
  flush?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({ className, as: Tag = "section", ...rest }: CardProps) {
  return <Tag className={cn("panel flex flex-col min-w-0", className)} {...rest} />;
}

export interface CardHeaderProps {
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ children, actions, className }: CardHeaderProps) {
  return (
    <header className={cn("flex items-center justify-between gap-3 px-4 h-10 border-b border-edge shrink-0", className)}>
      <div className="flex items-center gap-2 min-w-0">{children}</div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function CardTitle({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-xs font-semibold tracking-wide uppercase text-fg-muted truncate", className)}>
      {children}
      {hint ? <span className="ml-2 normal-case tracking-normal font-normal text-fg-subtle">{hint}</span> : null}
    </h2>
  );
}

export function CardBody({ children, className, flush }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={cn("min-w-0 flex-1", flush ? "" : "p-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <footer className={cn("px-4 py-2 border-t border-edge text-xs text-fg-subtle flex items-center gap-3", className)}>{children}</footer>;
}
