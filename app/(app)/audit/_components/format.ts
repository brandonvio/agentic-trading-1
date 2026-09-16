/**
 * Pure helpers shared by the audit page's server and client components.
 * Kept free of server-only imports so the client bundle can use them.
 */
import type { ZodType } from "zod";
import { AuditAction } from "@/lib/domain/audit";
import type { Tone } from "@/lib/ui/status";

export const AUDIT_LIMIT = 200;

export function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export function asEnum<T>(schema: ZodType<T>, value: string | string[] | undefined): T | undefined {
  const raw = first(value);
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** `<input type="date">` gives YYYY-MM-DD; the filter wants an ISO instant. */
export function dayToIso(day: string | undefined, edge: "start" | "end"): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return `${day}T${edge === "start" ? "00:00:00.000Z" : "23:59:59.999Z"}`;
}

export const ACTION_OPTIONS = AuditAction.options.map((value) => ({ value, label: value }));

/** Target types seen in the platform; the log stores them free-form. */
export const TARGET_TYPE_OPTIONS = [
  "order",
  "signal",
  "agent",
  "agent_run",
  "strategy",
  "portfolio",
  "position",
  "approval",
  "risk_limit",
  "risk_breach",
  "broker_account",
  "user",
].map((value) => ({ value, label: value.replace(/_/g, " ") }));

const ACTION_TONES: Array<[RegExp, Tone]> = [
  [/(rejected|cancelled|killed|disconnected|breach_detected)$/, "negative"],
  [/(filled|routed|resolved|connected|approved)$/, "positive"],
  [/^(risk|approval)\./, "warning"],
  [/^(agent|signal)\./, "info"],
  [/^order\./, "accent"],
];

/** Colour for an audit action so a scan of the log surfaces the exceptions. */
export function toneForAction(action: string): Tone {
  for (const [pattern, tone] of ACTION_TONES) if (pattern.test(action)) return tone;
  return "muted";
}

/**
 * Deep-link for an audit target; null when the entity has no page. Target
 * types are stored inconsistently (`agent_run` and `AgentRun` both occur), so
 * the comparison is case- and underscore-insensitive.
 */
export function targetHref(targetType: string, targetId: string): string | null {
  switch (targetType.toLowerCase().replace(/_/g, "")) {
    case "order":
      return `/orders/${targetId}`;
    case "signal":
      return `/signals/${targetId}`;
    case "agent":
      return `/agents/${targetId}`;
    case "agentrun":
      return `/agents/runs/${targetId}`;
    case "strategy":
      return `/strategies/${targetId}`;
    case "portfolio":
      return `/portfolios/${targetId}`;
    case "approvalrequest":
    case "approval":
      return "/approvals";
    case "riskbreach":
    case "risklimit":
      return "/risk";
    case "brokeraccount":
      return "/brokers";
    case "user":
      return "/admin/users";
    default:
      return null;
  }
}
