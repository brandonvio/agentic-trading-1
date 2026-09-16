/**
 * Create Neo4j constraints/indexes and seed static reference nodes.
 * Usage: pnpm db:schema   (reads NEO4J_* from .env.local / .env)
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { Neo4jClient, neo4jConfigFromEnv } from "@/lib/db/neo4j";
import { ensureSchema } from "@/lib/db/schema";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

async function main(): Promise<void> {
  const config = neo4jConfigFromEnv();
  const client = new Neo4jClient(config);
  try {
    await client.verifyConnectivity();
    const summary = await ensureSchema(client);
    console.log(`Schema ensured on ${config.uri} database '${config.database}'`);
    console.log(`  constraints: ${summary.constraints}`);
    console.log(`  indexes:     ${summary.indexes}`);
    console.log(`  brokers:     ${summary.brokers}`);
    console.log(`  permissions: ${summary.permissions}`);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error("db-schema failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
