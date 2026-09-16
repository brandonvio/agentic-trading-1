import neo4j from "neo4j-driver";
import { Bar, type BarInterval } from "@/lib/domain/instrument";
import type { BarRepository } from "../interfaces";
import { translateError, type RepoContext } from "./crud";

/**
 * Bars are keyed by (instrumentId, interval, time) rather than an id.
 * Stored as (:Bar {instrumentId, interval, time, open, high, low, close, volume})-[:OF]->(:Instrument).
 */
export class Neo4jBarRepository implements BarRepository {
  constructor(private readonly ctx: RepoContext) {}

  async list(instrumentId: string, interval: BarInterval, opts: { from?: string; to?: string; limit?: number }): Promise<Bar[]> {
    const limit = opts.limit !== undefined ? Math.max(1, Math.floor(opts.limit)) : null;
    const rows = await this.ctx.client.read<{ b: unknown }>(
      `MATCH (b:Bar {instrumentId: $instrumentId, interval: $interval})
       WHERE ($from IS NULL OR b.time >= $from) AND ($to IS NULL OR b.time <= $to)
       WITH b ORDER BY b.time DESC
       ${limit !== null ? "LIMIT $limit" : ""}
       WITH b ORDER BY b.time ASC
       RETURN b`,
      { instrumentId, interval, from: opts.from ?? null, to: opts.to ?? null, ...(limit !== null ? { limit: neo4j.int(limit) } : {}) },
    );
    return rows.map((r) => Bar.parse(toBar(r.b)));
  }

  async createMany(interval: BarInterval, bars: Bar[]): Promise<number> {
    if (bars.length === 0) return 0;
    const rows = bars.map((b) => Bar.parse(b));
    try {
      const row = await this.ctx.client.writeOne<{ written: number }>(
        `UNWIND $rows AS bar
         MERGE (b:Bar {instrumentId: bar.instrumentId, interval: $interval, time: bar.time})
         SET b.open = bar.open, b.high = bar.high, b.low = bar.low, b.close = bar.close, b.volume = bar.volume
         WITH b, bar
         OPTIONAL MATCH (i:Instrument {id: bar.instrumentId})
         FOREACH (_ IN CASE WHEN i IS NULL THEN [] ELSE [1] END | MERGE (b)-[:OF]->(i))
         RETURN count(b) AS written`,
        { interval, rows },
      );
      return row ? Number(row.written) : 0;
    } catch (e) {
      translateError(e);
    }
  }
}

function toBar(node: unknown): Record<string, unknown> {
  const props =
    node && typeof node === "object" && "properties" in node
      ? ((node as { properties: Record<string, unknown> }).properties ?? {})
      : ((node as Record<string, unknown>) ?? {});
  const { instrumentId, time, open, high, low, close, volume } = props;
  return { instrumentId, time, open, high, low, close, volume };
}
