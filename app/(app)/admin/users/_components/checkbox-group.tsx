"use client";

import { useId } from "react";

export interface CheckboxOption {
  value: string;
  label: string;
}

export interface CheckboxGroupProps {
  legend: string;
  name: string;
  options: CheckboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  error?: string | null;
  emptyText?: string;
}

/**
 * Accessible multi-select: a labelled fieldset of checkboxes. Preferred over a
 * native multiple-select, which is hard to operate with a keyboard.
 */
export function CheckboxGroup({ legend, name, options, selected, onChange, hint, error, emptyText }: CheckboxGroupProps) {
  const id = useId();

  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <fieldset aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1 block text-xs font-medium text-fg-muted">
        {legend}
        {hint ? <span className="ml-1.5 font-normal text-fg-subtle">{hint}</span> : null}
      </legend>
      {options.length === 0 ? (
        <p className="text-xs text-fg-subtle">{emptyText ?? "Nothing to choose from."}</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map((option) => {
            const inputId = `${id}-${name}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={inputId}
                className="flex cursor-pointer items-center gap-2 rounded border border-edge bg-surface-2 px-2 py-1.5 text-xs text-fg hover:border-edge-strong"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  name={name}
                  value={option.value}
                  checked={selected.includes(option.value)}
                  onChange={(e) => toggle(option.value, e.target.checked)}
                  className="size-3.5 accent-[var(--accent)]"
                />
                <span className="truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-negative">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
