/**
 * Shared Neo4j harness for repository integration tests. Each test file gets
 * a fresh, schema-ready `agenticproptest` database in `beforeAll`.
 */
import { afterAll, beforeAll } from "vitest";
import { Neo4jClient, testNeo4jConfig } from "@/lib/db/neo4j";
import { clearDatabase, ensureSchema } from "@/lib/db/schema";
import { FixedClock } from "@/lib/core/clock";
import type { Repositories } from "@/lib/repositories/interfaces";
import { createNeo4jRepositories } from "@/lib/repositories/neo4j";
import { resetFixtureIds } from "@/tests/fixtures/entities";

export interface Neo4jTestHarness {
  client: Neo4jClient;
  repos: Repositories;
  clock: FixedClock;
}

export const NOW = "2026-09-03T14:30:00.000Z";

/** Registers beforeAll/afterAll hooks and returns a lazily-populated harness. */
export function useNeo4j(): Neo4jTestHarness {
  const client = new Neo4jClient(testNeo4jConfig());
  const clock = new FixedClock(NOW);
  const harness: Neo4jTestHarness = { client, clock, repos: createNeo4jRepositories(client, { clock }) };

  beforeAll(async () => {
    await client.verifyConnectivity();
    await clearDatabase(client);
    await ensureSchema(client);
    resetFixtureIds();
  });

  afterAll(async () => {
    await client.close();
  });

  return harness;
}

/** Count relationships of a type from a node, for asserting graph edges. */
export async function countEdges(client: Neo4jClient, label: string, id: string, rel: string): Promise<number> {
  const row = await client.readOne<{ c: number }>(`MATCH (n:${label} {id: $id})-[r:${rel}]->() RETURN count(r) AS c`, { id });
  return row ? Number(row.c) : 0;
}

/** Ids of the nodes reached by a relationship type, for asserting graph edges. */
export async function edgeTargets(client: Neo4jClient, label: string, id: string, rel: string): Promise<string[]> {
  const rows = await client.read<{ t: string }>(
    `MATCH (n:${label} {id: $id})-[r:${rel}]->(t) RETURN coalesce(t.id, t.key) AS t ORDER BY t`,
    { id },
  );
  return rows.map((r) => r.t);
}
