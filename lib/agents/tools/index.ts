/**
 * The agent tool catalogue.
 *
 * Read-only tools are available to every autonomy level; order tools are
 * closed to advisory agents and restricted by agent kind. What an individual
 * agent may actually call is the intersection of this catalogue, the agent's
 * `tools` allow-list, its kind, its autonomy and its owner's permissions —
 * enforced in `ToolRegistry.invoke`.
 */
import { ToolRegistry, type ToolDefinition } from "./registry";
import { MARKET_TOOLS } from "./market";
import { PORTFOLIO_TOOLS } from "./portfolio";
import { SIGNAL_TOOLS } from "./signals";
import { TRADING_TOOLS } from "./trading";
import { COMPLIANCE_TOOLS } from "./compliance";

/** Every tool the platform ships, in catalogue order. */
export const ALL_TOOLS: readonly ToolDefinition[] = [
  ...MARKET_TOOLS,
  ...PORTFOLIO_TOOLS,
  ...SIGNAL_TOOLS,
  ...TRADING_TOOLS,
  ...COMPLIANCE_TOOLS,
];

/** Names of every shipped tool; the vocabulary `Agent.tools` is drawn from. */
export const ALL_TOOL_NAMES: readonly string[] = ALL_TOOLS.map((t) => t.name);

/** Build a registry containing the whole catalogue plus any extra tools (tests, plugins). */
export function createToolRegistry(extra: readonly ToolDefinition[] = []): ToolRegistry {
  return new ToolRegistry().registerAll(ALL_TOOLS).registerAll(extra);
}

export { ToolRegistry, defineTool, zodToJsonSchema } from "./registry";
export type { ToolContext, ToolDefinition, ToolInvocationResult } from "./registry";
export { resolvePortfolioId, agentActor, addHours, PortfolioIdInput } from "./shared";
export { MARKET_TOOLS, getMarketOverview, getQuotes, getBars, searchInstruments } from "./market";
export { PORTFOLIO_TOOLS, getPortfolioSnapshot, listPositions, getRiskReport, listOpenOrders } from "./portfolio";
export { SIGNAL_TOOLS, listRecentSignals, getStrategy, proposeSignal, requestHedge } from "./signals";
export { TRADING_TOOLS, submitOrder, cancelOrder } from "./trading";
export { COMPLIANCE_TOOLS, flagComplianceIssue, summarizeRun } from "./compliance";
