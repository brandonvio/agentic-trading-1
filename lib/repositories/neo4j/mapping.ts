/**
 * Generic entity <-> node property mapping.
 *
 * - Scalar and primitive-array properties are stored flat on the node.
 * - Nested objects / arrays of objects (listed in `jsonFields`) are stored as
 *   JSON strings under `<name>Json`.
 * - Neo4j cannot store `null` properties; on read, missing properties for
 *   required-nullable fields are restored to `null` before zod validation.
 * - Every decoded node is validated with the entity's zod schema so corrupt
 *   or stale data fails loudly instead of leaking into services.
 */
import type { z } from "zod";
import { toPlain } from "@/lib/db/neo4j";
import type { LinkStatement } from "./links";

export type EntitySchema<T> = z.ZodType<T> & { shape: Record<string, z.ZodType> };

export interface NodeDef<T extends object> {
  label: string;
  schema: EntitySchema<T>;
  /** Fields serialised to `<name>Json`. */
  jsonFields: readonly string[];
  /** Whether `updatedAt` should be bumped on update. */
  hasUpdatedAt: boolean;
  /**
   * Extra denormalised properties derived from (a subset of) the entity, e.g.
   * `actorId` from `actor`. Only keys present in the partial should be derived.
   */
  derive?: (partial: Partial<T>) => Record<string, unknown>;
  /** Relationship statements to (re)apply after the node is written. */
  links?: (entity: T) => LinkStatement[];
}

const JSON_SUFFIX = "Json";

export class NodeMapper<T extends object> {
  private readonly jsonFields: ReadonlySet<string>;
  private readonly nullableRequired: readonly string[];

  constructor(private readonly def: NodeDef<T>) {
    this.jsonFields = new Set(def.jsonFields);
    this.nullableRequired = Object.entries(def.schema.shape)
      .filter(([, field]) => !field.safeParse(undefined).success && field.safeParse(null).success)
      .map(([key]) => key);
  }

  /** Encode a full or partial entity into flat node properties (undefined keys are dropped). */
  encode(partial: Partial<T>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined) continue;
      if (this.jsonFields.has(key)) out[`${key}${JSON_SUFFIX}`] = JSON.stringify(value);
      else out[key] = value;
    }
    if (this.def.derive) Object.assign(out, this.def.derive(partial));
    return out;
  }

  /** Decode node properties (or a driver Node) into a validated entity. */
  decode(node: unknown): T {
    const props = toPlain<Record<string, unknown>>(node);
    if (!props || typeof props !== "object") {
      throw new Error(`Cannot decode ${this.def.label}: expected node properties`);
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key.endsWith(JSON_SUFFIX) && this.jsonFields.has(key.slice(0, -JSON_SUFFIX.length))) {
        out[key.slice(0, -JSON_SUFFIX.length)] = typeof value === "string" ? JSON.parse(value) : value;
      } else {
        out[key] = value;
      }
    }
    for (const key of this.nullableRequired) if (!(key in out)) out[key] = null;
    return this.def.schema.parse(out);
  }

  decodeMany(nodes: unknown): T[] {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((n) => this.decode(n));
  }
}
