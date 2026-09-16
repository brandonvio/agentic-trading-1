/**
 * Neo4j schema management: uniqueness constraints, indexes and static
 * reference nodes (brokers, permissions). Everything here is idempotent.
 */
import type { Neo4jClient } from "./neo4j";
import { PERMISSIONS } from "@/lib/domain/auth";
import { BrokerKey } from "@/lib/domain/instrument";

/** Labels whose `id` property must be unique. */
export const ENTITY_LABELS = [
  "User",
  "Role",
  "Desk",
  "Instrument",
  "Portfolio",
  "BrokerAccount",
  "Position",
  "Order",
  "Fill",
  "Strategy",
  "Backtest",
  "Agent",
  "AgentRun",
  "AgentStep",
  "Signal",
  "RiskLimit",
  "RiskBreach",
  "ApprovalRequest",
  "AuditEvent",
] as const;

/** Additional single-property uniqueness constraints: [label, property]. */
const UNIQUE_PROPS: ReadonlyArray<readonly [string, string]> = [
  ["User", "email"],
  ["Desk", "code"],
  ["Portfolio", "code"],
  ["Instrument", "symbol"],
  ["Strategy", "code"],
  ["Role", "key"],
  ["Broker", "key"],
  ["Permission", "key"],
];

/** Plain (non-unique) indexes: [label, properties]. */
const INDEXES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Order", ["status"]],
  ["Order", ["portfolioId"]],
  ["Order", ["createdAt"]],
  ["Position", ["portfolioId"]],
  ["AuditEvent", ["at"]],
  ["AuditEvent", ["portfolioId"]],
  ["Signal", ["status"]],
  ["Signal", ["portfolioId"]],
  ["AgentRun", ["agentId"]],
  ["AgentRun", ["portfolioId"]],
  ["AgentStep", ["runId"]],
  ["Fill", ["orderId"]],
  ["Fill", ["portfolioId"]],
  ["Portfolio", ["deskId"]],
  ["BrokerAccount", ["portfolioId"]],
  ["RiskLimit", ["scope", "scopeId"]],
  ["RiskBreach", ["portfolioId"]],
  ["ApprovalRequest", ["status"]],
  ["ApprovalRequest", ["subjectId"]],
];

export const BROKERS: ReadonlyArray<{ key: BrokerKey; name: string }> = [
  { key: "ibkr", name: "Interactive Brokers" },
  { key: "oanda", name: "OANDA" },
  { key: "tradovate", name: "Tradovate" },
  { key: "coinbase", name: "Coinbase" },
  { key: "kalshi", name: "Kalshi" },
];

export interface SchemaSummary {
  constraints: number;
  indexes: number;
  brokers: number;
  permissions: number;
}

function constraintName(label: string, props: readonly string[]): string {
  return `${label.toLowerCase()}_${props.join("_")}_unique`;
}

function indexName(label: string, props: readonly string[]): string {
  return `${label.toLowerCase()}_${props.join("_")}_idx`;
}

/** Build the list of DDL statements. Exported for inspection/tests. */
export function schemaStatements(): { constraints: string[]; indexes: string[] } {
  const constraints: string[] = [];
  for (const label of ENTITY_LABELS) {
    constraints.push(`CREATE CONSTRAINT ${constraintName(label, ["id"])} IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
  }
  for (const [label, prop] of UNIQUE_PROPS) {
    constraints.push(`CREATE CONSTRAINT ${constraintName(label, [prop])} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE`);
  }
  // Bars are keyed by (instrumentId, interval, time); the composite constraint doubles as the lookup index.
  constraints.push(
    `CREATE CONSTRAINT ${constraintName("Bar", ["instrumentId", "interval", "time"])} IF NOT EXISTS FOR (n:Bar) REQUIRE (n.instrumentId, n.interval, n.time) IS UNIQUE`,
  );

  const indexes: string[] = [];
  for (const [label, props] of INDEXES) {
    const cols = props.map((p) => `n.${p}`).join(", ");
    indexes.push(`CREATE INDEX ${indexName(label, props)} IF NOT EXISTS FOR (n:${label}) ON (${cols})`);
  }
  return { constraints, indexes };
}

/** Create constraints/indexes and seed static Broker and Permission nodes. Idempotent. */
export async function ensureSchema(client: Neo4jClient): Promise<SchemaSummary> {
  const { constraints, indexes } = schemaStatements();
  // Schema statements must run in their own (auto-commit) transactions.
  const session = client.session("WRITE");
  try {
    for (const stmt of constraints) await session.run(stmt);
    for (const stmt of indexes) await session.run(stmt);
    await session.run("CALL db.awaitIndexes(60)");
  } finally {
    await session.close();
  }

  await client.write(
    `UNWIND $brokers AS b
     MERGE (n:Broker {key: b.key})
     SET n.name = b.name`,
    { brokers: BROKERS },
  );
  await client.write(
    `UNWIND $keys AS k
     MERGE (:Permission {key: k})`,
    { keys: [...PERMISSIONS] },
  );

  return { constraints: constraints.length, indexes: indexes.length, brokers: BROKERS.length, permissions: PERMISSIONS.length };
}

/** Remove every node and relationship in the database (batched). Constraints/indexes are kept. */
export async function clearDatabase(client: Neo4jClient, batchSize = 10_000): Promise<void> {
  // `CALL ... IN TRANSACTIONS` requires an implicit (auto-commit) transaction.
  const session = client.session("WRITE");
  try {
    await session.run(`MATCH (n) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF ${Math.max(1, Math.floor(batchSize))} ROWS`);
  } finally {
    await session.close();
  }
}
