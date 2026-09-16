/**
 * Generate the deterministic dataset and write it to Neo4j.
 *
 * Usage:
 *   pnpm db:seed              # seed on top of whatever is there (idempotent MERGEs)
 *   pnpm db:seed -- --reset   # wipe first, then seed
 *   SEED_RESET=1 pnpm db:seed
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { buildContainer } from "@/lib/container";
import { TOKENS } from "@/lib/core/tokens";
import { generateSeedData, seedCounts, seedDatabase, resetDatabase, validateSeedData } from "@/lib/seed";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

function printTable(title: string, counts: Record<string, number>): void {
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  console.log(`\n${title}`);
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(width)}  ${String(count).padStart(7)}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${"total".padEnd(width)}  ${String(total).padStart(7)}`);
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset") || process.env.SEED_RESET === "1";
  const container = buildContainer({ persistence: "neo4j" });
  const repos = container.resolve(TOKENS.repos);
  const admin = container.resolve(TOKENS.repoAdmin);

  try {
    if (reset) {
      console.log("Wiping the database…");
      await resetDatabase(admin);
    } else {
      await admin.ensureSchema();
    }

    console.log("Generating seed data…");
    const data = generateSeedData();
    validateSeedData(data);
    printTable("Generated:", seedCounts(data));

    console.log("\nWriting to Neo4j…");
    const summary = await seedDatabase(repos, data, (line) => console.log(line));
    printTable("Written:", summary);
    console.log("\nSeed complete.");
  } finally {
    await admin.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nSeed failed:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  });
