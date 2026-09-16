import type { Paged, PageQuery } from "@/lib/domain/common";
import type { User, Role, RoleKey } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { UserRepository, RoleRepository, DeskRepository } from "@/lib/repositories/interfaces";
import { MemoryTable, paginate, sortByName, clone } from "./table";

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly table: MemoryTable<User>) {}

  async findById(id: string): Promise<User | null> {
    return this.table.get(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    const needle = email.trim().toLowerCase();
    return this.table.values().find((u) => u.email.toLowerCase() === needle) ?? null;
  }

  /** Sorted by name. */
  async list(filter: { deskId?: string; role?: RoleKey; status?: User["status"] }, page: PageQuery): Promise<Paged<User>> {
    const items = this.table.values().filter(
      (u) =>
        (!filter.deskId || u.deskIds.includes(filter.deskId)) &&
        (!filter.role || u.roles.includes(filter.role)) &&
        (!filter.status || u.status === filter.status),
    );
    return paginate(sortByName(items, (u) => u.name), page);
  }

  async create(user: User): Promise<User> {
    return this.table.insert(user);
  }

  async update(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    return this.table.patch(id, patch);
  }

  async delete(id: string): Promise<void> {
    this.table.remove(id);
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  constructor(private readonly table: MemoryTable<Role>) {}

  async findByKey(key: RoleKey): Promise<Role | null> {
    return this.table.values().find((r) => r.key === key) ?? null;
  }

  async list(): Promise<Role[]> {
    return sortByName(this.table.values(), (r) => r.key);
  }

  async upsert(role: Role): Promise<Role> {
    const existing = await this.findByKey(role.key);
    if (existing && existing.id !== role.id) this.table.remove(existing.id);
    return this.table.upsert(clone(role));
  }
}

export class InMemoryDeskRepository implements DeskRepository {
  constructor(private readonly table: MemoryTable<Desk>) {}

  async findById(id: string): Promise<Desk | null> {
    return this.table.get(id);
  }

  async findByCode(code: string): Promise<Desk | null> {
    return this.table.values().find((d) => d.code === code) ?? null;
  }

  /** Sorted by name. */
  async list(page: PageQuery): Promise<Paged<Desk>> {
    return paginate(sortByName(this.table.values(), (d) => d.name), page);
  }

  async listByIds(ids: string[]): Promise<Desk[]> {
    const set = new Set(ids);
    return sortByName(
      this.table.values().filter((d) => set.has(d.id)),
      (d) => d.name,
    );
  }

  async create(desk: Desk): Promise<Desk> {
    return this.table.insert(desk);
  }

  async update(id: string, patch: Partial<Omit<Desk, "id" | "createdAt">>): Promise<Desk> {
    return this.table.patch(id, patch);
  }
}
