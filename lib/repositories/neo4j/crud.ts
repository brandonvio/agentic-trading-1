/**
 * Generic node CRUD used by every Neo4j repository. Cypher is assembled from
 * code constants (labels, property names) only; all values go through $params.
 */
import neo4j, { type ManagedTransaction } from "neo4j-driver";
import type { Paged, PageQuery } from "@/lib/domain/common";
import { ConflictError, NotFoundError } from "@/lib/core/errors";
import type { CypherParams, Neo4jClient } from "@/lib/db/neo4j";
import { NodeMapper, type NodeDef } from "./mapping";

export interface RepoContext {
  client: Neo4jClient;
  /** Current time as ISO string; used for `updatedAt` when a patch omits it. */
  now: () => string;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(value: string): string {
  if (!IDENT.test(value)) throw new Error(`Invalid Cypher identifier: ${value}`);
  return value;
}

/** Map driver constraint violations to a domain ConflictError; rethrow anything else. */
export function translateError(e: unknown): never {
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: unknown }).code);
    if (code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
      throw new ConflictError(e instanceof Error ? e.message : "Constraint violation");
    }
  }
  throw e;
}

/** Composable WHERE clause builder; every value is bound as a parameter. */
export class Where {
  private readonly conds: string[] = [];
  readonly params: CypherParams = {};

  constructor(private readonly alias = "n") {}

  /** `alias.prop = $prop` when value is defined. */
  eq(prop: string, value: unknown, param = prop): this {
    if (value === undefined) return this;
    this.conds.push(`${this.alias}.${ident(prop)} = $${ident(param)}`);
    this.params[param] = value;
    return this;
  }

  /** `alias.prop IN $param` when values is defined. */
  in(prop: string, values: readonly unknown[] | undefined, param = `${prop}_in`): this {
    if (values === undefined) return this;
    this.conds.push(`${this.alias}.${ident(prop)} IN $${ident(param)}`);
    this.params[param] = [...values];
    return this;
  }

  gte(prop: string, value: unknown, param = `${prop}_from`): this {
    if (value === undefined) return this;
    this.conds.push(`${this.alias}.${ident(prop)} >= $${ident(param)}`);
    this.params[param] = value;
    return this;
  }

  lte(prop: string, value: unknown, param = `${prop}_to`): this {
    if (value === undefined) return this;
    this.conds.push(`${this.alias}.${ident(prop)} <= $${ident(param)}`);
    this.params[param] = value;
    return this;
  }

  /** Raw predicate (must reference only parameters, never inlined values). */
  raw(condition: string, params: CypherParams = {}): this {
    this.conds.push(`(${condition})`);
    Object.assign(this.params, params);
    return this;
  }

  /** Conditionally add a raw predicate. */
  when(enabled: boolean, condition: string, params: CypherParams = {}): this {
    return enabled ? this.raw(condition, params) : this;
  }

  clause(): string {
    return this.conds.length ? `WHERE ${this.conds.join(" AND ")}` : "";
  }
}

export interface ListOptions {
  where?: Where;
  /** ORDER BY expression, e.g. `n.createdAt DESC, n.id DESC`. */
  orderBy: string;
}

function pageParams(page: PageQuery): { limit: number; offset: number } {
  const limit = Math.max(1, Math.floor(page?.limit ?? 50));
  const offset = Math.max(0, Math.floor(page?.offset ?? 0));
  return { limit, offset };
}

/** Base class for id-keyed node repositories. */
export abstract class NodeRepository<T extends object> {
  protected readonly mapper: NodeMapper<T>;
  protected readonly label: string;

  protected constructor(
    protected readonly ctx: RepoContext,
    protected readonly def: NodeDef<T>,
  ) {
    this.mapper = new NodeMapper(def);
    this.label = ident(def.label);
  }

  protected get client(): Neo4jClient {
    return this.ctx.client;
  }

  protected async findNodeById(id: string): Promise<T | null> {
    return this.findNodeBy("id", id);
  }

  protected async findNodeBy(prop: string, value: unknown): Promise<T | null> {
    const row = await this.client.readOne<{ n: unknown }>(
      `MATCH (n:${this.label} {${ident(prop)}: $value}) RETURN n LIMIT 1`,
      { value },
    );
    return row ? this.mapper.decode(row.n) : null;
  }

  protected async findNodesByIds(ids: readonly string[], orderBy = "n.id ASC"): Promise<T[]> {
    if (ids.length === 0) return [];
    const rows = await this.client.read<{ n: unknown }>(
      `MATCH (n:${this.label}) WHERE n.id IN $ids RETURN n ORDER BY ${orderBy}`,
      { ids: [...ids] },
    );
    return rows.map((r) => this.mapper.decode(r.n));
  }

  /** Read a list of nodes with a custom WHERE/ORDER (no paging). */
  protected async findNodes(where: Where, orderBy: string, extraCypher = ""): Promise<T[]> {
    const rows = await this.client.read<{ n: unknown }>(
      `MATCH (n:${this.label}) ${where.clause()} ${extraCypher} RETURN n ORDER BY ${orderBy}`,
      where.params,
    );
    return rows.map((r) => this.mapper.decode(r.n));
  }

  protected async listNodes(opts: ListOptions, page: PageQuery): Promise<Paged<T>> {
    const where = opts.where ?? new Where();
    const { limit, offset } = pageParams(page);
    const match = `MATCH (n:${this.label}) ${where.clause()}`;
    const row = await this.client.readOne<{ total: number; items: unknown[] }>(
      `${match}
       WITH count(n) AS total
       ${match}
       WITH total, n ORDER BY ${opts.orderBy}
       SKIP $offset LIMIT $limit
       RETURN total, collect(n) AS items`,
      { ...where.params, offset: neo4j.int(offset), limit: neo4j.int(limit) },
    );
    return {
      items: row ? this.mapper.decodeMany(row.items) : [],
      total: row ? Number(row.total) : 0,
      limit,
      offset,
    };
  }

  /** Upsert a fully-formed entity by id and (re)apply its relationships. */
  protected async createNode(entity: T, mergeProp = "id"): Promise<T> {
    const parsed = this.def.schema.parse(entity);
    const props = this.mapper.encode(parsed);
    const key = ident(mergeProp);
    try {
      return await this.client.writeTx(async (tx) => {
        const res = await tx.run(`MERGE (n:${this.label} {${key}: $key}) SET n = $props RETURN n`, { key: props[key], props });
        const created = this.mapper.decode(res.records[0]?.get("n"));
        await this.applyLinks(tx, created);
        return created;
      });
    } catch (e) {
      translateError(e);
    }
  }

  /** Upsert many entities in one UNWIND, then apply relationships per entity. Returns the count written. */
  protected async createNodes(entities: readonly T[]): Promise<number> {
    if (entities.length === 0) return 0;
    const rows = entities.map((e) => this.mapper.encode(this.def.schema.parse(e)));
    try {
      return await this.client.writeTx(async (tx) => {
        const res = await tx.run(
          `UNWIND $rows AS row
           MERGE (n:${this.label} {id: row.id})
           SET n = row
           RETURN collect(n) AS nodes`,
          { rows },
        );
        const written = this.mapper.decodeMany(res.records[0]?.get("nodes"));
        for (const entity of written) await this.applyLinks(tx, entity);
        return written.length;
      });
    } catch (e) {
      translateError(e);
    }
  }

  /** Partial merge; bumps `updatedAt` when the entity has one and the patch does not set it. */
  protected async updateNode(id: string, patch: Partial<T>): Promise<T> {
    const props = this.mapper.encode(patch);
    delete props.id;
    delete props.createdAt;
    if (this.def.hasUpdatedAt && props.updatedAt === undefined) props.updatedAt = this.ctx.now();
    try {
      return await this.client.writeTx(async (tx) => {
        const res = await tx.run(`MATCH (n:${this.label} {id: $id}) SET n += $props RETURN n`, { id, props });
        const record = res.records[0];
        if (!record) throw new NotFoundError(this.label, id);
        const updated = this.mapper.decode(record.get("n"));
        await this.applyLinks(tx, updated);
        return updated;
      });
    } catch (e) {
      translateError(e);
    }
  }

  protected async deleteNode(id: string): Promise<void> {
    const row = await this.client.writeOne<{ deleted: number }>(
      `MATCH (n:${this.label} {id: $id})
       WITH n, n.id AS deletedId
       DETACH DELETE n
       RETURN count(deletedId) AS deleted`,
      { id },
    );
    if (!row || Number(row.deleted) === 0) throw new NotFoundError(this.label, id);
  }

  private async applyLinks(tx: ManagedTransaction, entity: T): Promise<void> {
    for (const stmt of this.def.links?.(entity) ?? []) await tx.run(stmt.cypher, stmt.params);
  }
}
