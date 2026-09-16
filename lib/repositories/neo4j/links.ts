/**
 * Relationship maintenance helpers. Each statement re-points one relationship
 * type from a source node: existing edges of that type are removed and new
 * ones MERGEd towards the given target(s). Targets that do not exist are
 * silently skipped so repositories stay thin (no referential-integrity rules).
 */
import type { CypherParams } from "@/lib/db/neo4j";

export interface LinkStatement {
  cypher: string;
  params: CypherParams;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(value: string, what: string): string {
  if (!IDENT.test(value)) throw new Error(`Invalid Cypher ${what}: ${value}`);
  return value;
}

function labelExpr(labels: readonly string[]): string {
  return labels.map((l) => ident(l, "label")).join("|");
}

interface RelinkOptions {
  /** Source node label and id. */
  label: string;
  id: string;
  rel: string;
  /** Candidate target labels (e.g. ["User", "Agent"]). Empty → only remove existing edges. */
  targetLabels: readonly string[];
  /** Target identifier; null/undefined → only remove existing edges. */
  targetId: string | null | undefined;
  /** Property on the target used for matching (default `id`). */
  matchProp?: string;
  relProps?: Record<string, unknown>;
}

/** Point a single-valued relationship at (at most) one target. */
export function relink(opts: RelinkOptions): LinkStatement {
  const label = ident(opts.label, "label");
  const rel = ident(opts.rel, "relationship type");
  const matchProp = ident(opts.matchProp ?? "id", "property");
  const head = `MATCH (n:${label} {id: $id})
OPTIONAL MATCH (n)-[old:${rel}]->()
DELETE old
WITH DISTINCT n`;
  if (!opts.targetId || opts.targetLabels.length === 0) {
    return { cypher: `${head}\nRETURN count(n) AS n`, params: { id: opts.id } };
  }
  return {
    cypher: `${head}
OPTIONAL MATCH (t:${labelExpr(opts.targetLabels)} {${matchProp}: $targetId})
FOREACH (_ IN CASE WHEN t IS NULL THEN [] ELSE [1] END | MERGE (n)-[r:${rel}]->(t) SET r = $relProps)
RETURN count(n) AS n`,
    params: { id: opts.id, targetId: opts.targetId, relProps: opts.relProps ?? {} },
  };
}

export interface LinkTarget {
  targetId: string;
  props?: Record<string, unknown>;
}

interface RelinkManyOptions {
  label: string;
  id: string;
  rel: string;
  targetLabels: readonly string[];
  targets: readonly LinkTarget[];
  matchProp?: string;
}

/** Point a multi-valued relationship at a set of targets (optionally with edge properties). */
export function relinkMany(opts: RelinkManyOptions): LinkStatement {
  const label = ident(opts.label, "label");
  const rel = ident(opts.rel, "relationship type");
  const matchProp = ident(opts.matchProp ?? "id", "property");
  const items = opts.targets.map((t) => ({ targetId: t.targetId, props: t.props ?? {} }));
  return {
    cypher: `MATCH (n:${label} {id: $id})
OPTIONAL MATCH (n)-[old:${rel}]->()
DELETE old
WITH DISTINCT n
CALL (n) {
  UNWIND $items AS it
  MATCH (t:${labelExpr(opts.targetLabels)} {${matchProp}: it.targetId})
  MERGE (n)-[r:${rel}]->(t)
  SET r = it.props
}
RETURN count(n) AS n`,
    params: { id: opts.id, items },
  };
}
