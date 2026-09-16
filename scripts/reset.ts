/**
 * Wipe every node in the Neo4j database and re-apply constraints/indexes.
 * Usage: pnpm db:reset
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { buildContainer } from "@/lib/container";
import { TOKENS } from "@/lib/core/tokens";
import { resetDatabase } from "@/lib/seed";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

async function main(): Promise<void> {
  const container = buildContainer({ persistence: "neo4j" });
  const admin = container.resolve(TOKENS.repoAdmin);
  try {
    await resetDatabase(admin);
    console.log("Database cleared and schema re-applied.");
  } finally {
    await admin.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Reset failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
