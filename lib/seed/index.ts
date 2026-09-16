/**
 * Writes a generated seed dataset through the repository layer, in dependency
 * order, so the same code path works against Neo4j and the in-memory set.
 */
import type { Repositories, RepositoryAdmin } from "@/lib/repositories/interfaces";
import type { SeedData } from "./generate";

export { generateSeedData, validateSeedData, seedCounts, SeedValidationError, DEFAULT_SEED, DEFAULT_SEED_NOW } from "./generate";
export type { SeedData, GenerateSeedOptions } from "./generate";

export type SeedSummary = Record<string, number>;

export type SeedLogger = (message: string) => void;

/** Entities written one at a time, in this many parallel in-flight writes. */
const CONCURRENCY = 12;

async function writeAll<T>(items: readonly T[], write: (item: T) => Promise<unknown>): Promise<number> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map((item) => write(item)));
  }
  return items.length;
}

/**
 * Persists the dataset. Roles, users and desks come first because everything
 * else references them; audit events come last because they reference
 * everything.
 */
export async function seedDatabase(repos: Repositories, data: SeedData, log: SeedLogger = () => {}): Promise<SeedSummary> {
  const summary: SeedSummary = {};
  const step = async (name: string, run: () => Promise<number>): Promise<void> => {
    const started = Date.now();
    summary[name] = await run();
    log(`  ${name.padEnd(16)} ${String(summary[name]).padStart(6)}  (${Date.now() - started}ms)`);
  };

  await step("roles", () => writeAll(data.roles, (r) => repos.roles.upsert(r)));
  await step("users", () => writeAll(data.users, (u) => repos.users.create(u)));
  await step("desks", () => writeAll(data.desks, (d) => repos.desks.create(d)));
  await step("instruments", () => repos.instruments.createMany(data.instruments));
  await step("dailyBars", () => repos.bars.createMany("1d", data.dailyBars));
  await step("hourlyBars", () => repos.bars.createMany("1h", data.hourlyBars));
  await step("portfolios", () => writeAll(data.portfolios, (p) => repos.portfolios.create(p)));
  await step("brokerAccounts", () => writeAll(data.brokerAccounts, (a) => repos.brokerAccounts.create(a)));
  await step("positions", () => writeAll(data.positions, (p) => repos.positions.create(p)));
  await step("strategies", () => writeAll(data.strategies, (s) => repos.strategies.create(s)));
  await step("backtests", () => writeAll(data.backtests, (b) => repos.backtests.create(b)));
  await step("agents", () => writeAll(data.agents, (a) => repos.agents.create(a)));
  await step("agentRuns", () => writeAll(data.agentRuns, (r) => repos.agentRuns.create(r)));
  await step("agentSteps", () => writeAll(data.agentSteps, (s) => repos.agentRuns.appendStep(s)));
  await step("signals", () => writeAll(data.signals, (s) => repos.signals.create(s)));
  await step("orders", () => writeAll(data.orders, (o) => repos.orders.create(o)));
  await step("fills", () => writeAll(data.fills, (f) => repos.fills.create(f)));
  await step("riskLimits", () => writeAll(data.riskLimits, (l) => repos.riskLimits.create(l)));
  await step("riskBreaches", () => writeAll(data.riskBreaches, (b) => repos.riskBreaches.create(b)));
  await step("approvals", () => writeAll(data.approvals, (a) => repos.approvals.create(a)));
  await step("auditEvents", () => repos.audit.createMany(data.auditEvents));

  return summary;
}

/** Wipes every node and re-applies constraints/indexes. */
export async function resetDatabase(admin: RepositoryAdmin): Promise<void> {
  await admin.clearAll();
  await admin.ensureSchema();
}
