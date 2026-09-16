/**
 * Resolve node labels for polymorphic relationship targets (approval subjects,
 * audit targets) from the platform id prefix convention (lib/core/ids.ts) or
 * a free-form target-type string.
 */
import { ID_PREFIX } from "@/lib/core/ids";

const PREFIX_TO_LABEL: Record<string, string> = {
  [ID_PREFIX.user]: "User",
  [ID_PREFIX.role]: "Role",
  [ID_PREFIX.desk]: "Desk",
  [ID_PREFIX.portfolio]: "Portfolio",
  [ID_PREFIX.brokerAccount]: "BrokerAccount",
  [ID_PREFIX.instrument]: "Instrument",
  [ID_PREFIX.position]: "Position",
  [ID_PREFIX.order]: "Order",
  [ID_PREFIX.fill]: "Fill",
  [ID_PREFIX.strategy]: "Strategy",
  [ID_PREFIX.agent]: "Agent",
  [ID_PREFIX.agentRun]: "AgentRun",
  [ID_PREFIX.agentStep]: "AgentStep",
  [ID_PREFIX.signal]: "Signal",
  [ID_PREFIX.riskLimit]: "RiskLimit",
  [ID_PREFIX.riskBreach]: "RiskBreach",
  [ID_PREFIX.approval]: "ApprovalRequest",
  [ID_PREFIX.audit]: "AuditEvent",
  [ID_PREFIX.backtest]: "Backtest",
};

const TYPE_TO_LABEL: Record<string, string> = {
  user: "User",
  role: "Role",
  desk: "Desk",
  portfolio: "Portfolio",
  brokeraccount: "BrokerAccount",
  broker_account: "BrokerAccount",
  instrument: "Instrument",
  position: "Position",
  order: "Order",
  fill: "Fill",
  strategy: "Strategy",
  backtest: "Backtest",
  agent: "Agent",
  agentrun: "AgentRun",
  agent_run: "AgentRun",
  run: "AgentRun",
  agentstep: "AgentStep",
  agent_step: "AgentStep",
  signal: "Signal",
  risklimit: "RiskLimit",
  risk_limit: "RiskLimit",
  riskbreach: "RiskBreach",
  risk_breach: "RiskBreach",
  breach: "RiskBreach",
  approval: "ApprovalRequest",
  approvalrequest: "ApprovalRequest",
  approval_request: "ApprovalRequest",
  auditevent: "AuditEvent",
  audit_event: "AuditEvent",
};

/** Label implied by an id such as `ord_3k9x2p7q1a`, or null when unknown. */
export function labelForId(id: string | null | undefined): string | null {
  if (!id) return null;
  const idx = id.indexOf("_");
  if (idx <= 0) return null;
  return PREFIX_TO_LABEL[id.slice(0, idx)] ?? null;
}

/** Label implied by a target-type string such as `order` / `RiskLimit`, or null when unknown. */
export function labelForType(type: string | null | undefined): string | null {
  if (!type) return null;
  return TYPE_TO_LABEL[type.toLowerCase()] ?? null;
}

/** Best-effort label for a polymorphic target: id prefix first, then type. */
export function resolveTargetLabel(id: string | null | undefined, type?: string | null): string | null {
  return labelForId(id) ?? labelForType(type);
}

/** Labels used for `Actor` edges (system actors have no node). */
export function actorLabels(kind: string): string[] {
  if (kind === "user") return ["User"];
  if (kind === "agent") return ["Agent"];
  return [];
}
