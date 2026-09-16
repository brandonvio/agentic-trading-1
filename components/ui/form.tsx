import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const fieldClasses = (extra?: string, invalid?: boolean) =>
  cn(
    "w-full h-8 rounded-md border bg-surface-2 px-2.5 text-[13px] text-fg placeholder:text-fg-subtle transition-colors",
    "hover:border-edge-strong focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    invalid ? "border-negative" : "border-edge",
    extra,
  );

export function Label({ className, hint, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { hint?: ReactNode }) {
  return (
    <label className={cn("block text-xs font-medium text-fg-muted mb-1", className)} {...rest}>
      {children}
      {hint ? <span className="ml-1.5 font-normal text-fg-subtle">{hint}</span> : null}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
}

export function Input({ className, invalid, mono, ...rest }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={fieldClasses(cn(mono && "num", className), invalid)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export function Select({ className, invalid, options, placeholder, children, ...rest }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={fieldClasses(
        cn("appearance-none pr-7 bg-no-repeat bg-[right_0.5rem_center] bg-[length:12px_12px]", className),
        invalid,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa3b5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")",
      }}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options ? options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      )) : children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  mono?: boolean;
}

export function Textarea({ className, invalid, mono, rows = 3, ...rest }: TextareaProps) {
  return <textarea rows={rows} aria-invalid={invalid || undefined} className={fieldClasses(cn("h-auto py-1.5 resize-y", mono && "num", className), invalid)} {...rest} />;
}

/** Label + control + error/help wrapper. */
export function Field({ label, htmlFor, error, help, hint, children, className }: { label: ReactNode; htmlFor: string; error?: string | null; help?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-negative">
          {error}
        </p>
      ) : help ? (
        <p className="mt-1 text-xs text-fg-subtle">{help}</p>
      ) : null}
    </div>
  );
}
