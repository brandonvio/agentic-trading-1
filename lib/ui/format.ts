/**
 * Pure formatting helpers shared by server and client components. Every
 * time-relative helper takes an explicit `now` so server and client render the
 * same string (no hydration drift).
 */
import type { Currency } from "@/lib/domain/common";

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "CHF ",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
  BTC: "₿",
  ETH: "Ξ",
  SOL: "SOL ",
  USDC: "USDC ",
};

const ZERO_DECIMAL: ReadonlySet<Currency> = new Set(["JPY"]);

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fixed(value: number, decimals: number): string {
  const [int, frac] = Math.abs(value).toFixed(decimals).split(".");
  return frac !== undefined && decimals > 0 ? `${groupThousands(int)}.${frac}` : groupThousands(int);
}

function compactNumber(abs: number, decimals = 2): string {
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const v = abs / div;
      const d = v >= 100 ? Math.max(0, decimals - 2) : v >= 10 ? Math.max(0, decimals - 1) : decimals;
      return `${trimZeros(v.toFixed(d))}${suffix}`;
    }
  }
  return trimZeros(abs.toFixed(decimals));
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export interface MoneyOptions {
  compact?: boolean;
  /** Force a leading sign for positive numbers. */
  sign?: boolean;
  decimals?: number;
}

/** formatMoney(1_240_000_000, "USD", {compact:true}) → "$1.24B"; formatMoney(12340.5) → "$12,340.50" */
export function formatMoney(value: number | null | undefined, currency: Currency = "USD", opts: MoneyOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const negative = value < 0;
  const abs = Math.abs(value);
  const decimals = opts.decimals ?? (ZERO_DECIMAL.has(currency) ? 0 : 2);
  const body = opts.compact ? compactNumber(abs, 2) : fixed(abs, decimals);
  const sign = negative ? "-" : opts.sign && value > 0 ? "+" : "";
  return `${sign}${symbol}${body}`;
}

export interface PctOptions {
  sign?: boolean;
  decimals?: number;
}

/** formatPct(0.0124, {sign:true}) → "+1.24%" (input is a fraction). */
export function formatPct(fraction: number | null | undefined, opts: PctOptions = {}): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  const decimals = opts.decimals ?? 2;
  const pct = fraction * 100;
  const sign = pct < 0 ? "-" : opts.sign && pct > 0 ? "+" : "";
  return `${sign}${fixed(pct, decimals)}%`;
}

export interface NumberOptions {
  decimals?: number;
  compact?: boolean;
  sign?: boolean;
}

export function formatNumber(value: number | null | undefined, opts: NumberOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : opts.sign && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const body = opts.compact ? compactNumber(abs, opts.decimals ?? 2) : fixed(abs, opts.decimals ?? 0);
  return `${sign}${body}`;
}

/** Quantities: integers stay integers, fractional quantities keep up to 4 significant decimals. */
export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return formatNumber(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}${trimZeros(fixed(Math.abs(value), 4))}`;
}

/** Multiplier such as leverage: 2.3 → "2.30x". */
export function formatMultiple(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${fixed(value, decimals)}x`;
}

export interface DateTimeOptions {
  timeZone?: "UTC" | "America/New_York" | string;
  /** "datetime" (default) | "date" | "time" */
  style?: "datetime" | "date" | "time";
  seconds?: boolean;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(key: string, init: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", init);
    dtfCache.set(key, f);
  }
  return f;
}

/** "2026-09-03 14:32 UTC" style, deterministic across runtimes. */
export function formatDateTime(iso: string | Date | null | undefined, opts: DateTimeOptions = {}): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const timeZone = opts.timeZone ?? "UTC";
  const style = opts.style ?? "datetime";
  const parts = dtf(`${timeZone}|${style}|${opts.seconds ? 1 : 0}`, {
    timeZone,
    hourCycle: "h23",
    ...(style !== "time" ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}),
    ...(style !== "date" ? { hour: "2-digit", minute: "2-digit", ...(opts.seconds ? { second: "2-digit" } : {}) } : {}),
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}${opts.seconds ? `:${get("second")}` : ""}`;
  if (style === "date") return date;
  if (style === "time") return time;
  return `${date} ${time}`;
}

/** "3m ago" / "in 2h" relative to `now` (ms or ISO). Always pass `now` from the server to avoid drift. */
export function formatRelative(iso: string | Date | null | undefined, now: number | string | Date): string {
  if (!iso) return "—";
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  const n = typeof now === "number" ? now : new Date(now).getTime();
  if (Number.isNaN(t) || Number.isNaN(n)) return "—";
  const diff = n - t;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: Array<[number, string]> = [
    [1000 * 60 * 60 * 24 * 365, "y"],
    [1000 * 60 * 60 * 24 * 30, "mo"],
    [1000 * 60 * 60 * 24 * 7, "w"],
    [1000 * 60 * 60 * 24, "d"],
    [1000 * 60 * 60, "h"],
    [1000 * 60, "m"],
    [1000, "s"],
  ];
  if (abs < 5000) return "just now";
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const v = Math.floor(abs / ms);
      return future ? `in ${v}${label}` : `${v}${label} ago`;
    }
  }
  return "just now";
}

/** Symbols are already canonical; this trims whitespace and upper-cases plain tickers. */
export function formatSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "—";
  const s = symbol.trim();
  return /^[a-z0-9.\-/]+$/i.test(s) ? s.toUpperCase() : s;
}

/** Humanise snake_case / SCREAMING_CASE enum values: "risk_on" → "Risk on", "PENDING_APPROVAL" → "Pending approval". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Initials for avatars: "Ada Lovelace" → "AL". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Sign of a number for colouring: "pos" | "neg" | "zero". */
export function signOf(value: number | null | undefined): "pos" | "neg" | "zero" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "zero";
  return value > 0 ? "pos" : "neg";
}
