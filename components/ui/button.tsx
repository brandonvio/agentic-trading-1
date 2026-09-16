import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { SpinnerIcon } from "@/components/icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-strong border-transparent shadow-[0_1px_0_rgb(255_255_255/0.12)_inset]",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3 border-edge-strong",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 border-transparent",
  danger: "bg-negative/15 text-negative hover:bg-negative/25 border-negative/30",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-2xs gap-1 rounded",
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-md",
  lg: "h-10 px-4 text-sm gap-2 rounded-md",
};

export const buttonClasses = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) =>
  cn(
    "inline-flex items-center justify-center whitespace-nowrap border font-medium select-none transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ring",
    VARIANT[variant],
    SIZE[size],
    extra,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <SpinnerIcon size={14} /> : icon}
      {children}
    </button>
  );
}

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
  prefetch?: boolean;
}

export function ButtonLink({ href, variant = "secondary", size = "md", icon, className, children, prefetch }: ButtonLinkProps) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClasses(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
