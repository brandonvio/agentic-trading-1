/**
 * Shared primitives for the in-memory repositories.
 *
 * `MemoryTable` is a Map-backed store that deep-clones on every read and
 * write so callers can never mutate persisted state through a returned
 * reference. Rows remember their insertion sequence so "newest-first"
 * orderings are stable even when timestamps collide (FixedClock in tests).
 */
import type { Paged, PageQuery } from "@/lib/domain/common";
import { ConflictError, NotFoundError } from "@/lib/core/errors";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

interface Row<T> {
  seq: number;
  value: T;
}

export class MemoryTable<T extends { id: string }> {
  private readonly rows = new Map<string, Row<T>>();
  private seq = 0;

  constructor(private readonly entity: string) {}

  get size(): number {
    return this.rows.size;
  }

  get(id: string): T | null {
    const row = this.rows.get(id);
    return row ? clone(row.value) : null;
  }

  has(id: string): boolean {
    return this.rows.has(id);
  }

  /** All rows in insertion order (cloned). */
  values(): T[] {
    return [...this.rows.values()].map((r) => clone(r.value));
  }

  /** All rows, latest insertion first (cloned). */
  valuesNewestInserted(): T[] {
    return [...this.rows.values()].reverse().map((r) => clone(r.value));
  }

  insert(value: T): T {
    if (this.rows.has(value.id)) throw new ConflictError(`${this.entity} '${value.id}' already exists`);
    this.rows.set(value.id, { seq: ++this.seq, value: clone(value) });
    return clone(value);
  }

  /** Insert or replace by id, keeping the original insertion sequence when replacing. */
  upsert(value: T): T {
    const existing = this.rows.get(value.id);
    this.rows.set(value.id, { seq: existing?.seq ?? ++this.seq, value: clone(value) });
    return clone(value);
  }

  patch(id: string, patch: Partial<T>): T {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError(this.entity, id);
    const next = { ...row.value, ...clone(patch), id } as T;
    row.value = next;
    return clone(next);
  }

  remove(id: string): void {
    if (!this.rows.delete(id)) throw new NotFoundError(this.entity, id);
  }

  clear(): void {
    this.rows.clear();
  }
}

export function paginate<T>(items: T[], page: PageQuery): Paged<T> {
  const limit = Math.max(1, page.limit);
  const offset = Math.max(0, page.offset);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

/** Stable sort ascending by an ISO timestamp / string key. */
export function sortAsc<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/**
 * Stable sort descending by a timestamp key. Callers should pass items in
 * newest-inserted-first order so timestamp ties keep the latest insert first.
 */
export function sortDesc<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => (key(a) > key(b) ? -1 : key(a) < key(b) ? 1 : 0));
}

export function sortByName<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export function matches(value: string, search: string | undefined): boolean {
  if (!search) return true;
  return value.toLowerCase().includes(search.toLowerCase());
}
