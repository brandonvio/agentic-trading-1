import type { Paged, PageQuery } from "@/lib/domain/common";
import { CreateUserInput, UpdateUserInput, type Principal, type Role, type User } from "@/lib/domain/auth";
import type { UserRepository, RoleRepository } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import { ID_PREFIX } from "@/lib/core/ids";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/core/errors";
import { ROLE_CATALOG } from "@/lib/auth/permissions";
import type { UserService, AuditService } from "./interfaces";
import { actorOf, requirePermission } from "./authz";

/** User administration: users:read for lookups, users:manage for changes. */
export class UserServiceImpl implements UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Requires users:read. */
  async get(principal: Principal, id: string): Promise<User> {
    requirePermission(principal, "users:read");
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("User", id);
    return user;
  }

  /** Requires users:read. */
  async list(principal: Principal, filter: { deskId?: string; role?: User["roles"][number] }, page: PageQuery): Promise<Paged<User>> {
    requirePermission(principal, "users:read");
    return this.users.list(filter, page);
  }

  /** Requires users:manage. Validates input, enforces unique email, audits user.created. */
  async create(principal: Principal, input: CreateUserInput): Promise<User> {
    requirePermission(principal, "users:manage");
    const parsed = CreateUserInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid user", parsed.error.flatten());
    const existing = await this.users.findByEmail(parsed.data.email);
    if (existing) throw new ConflictError(`A user with email '${parsed.data.email}' already exists`);
    const now = this.clock.nowIso();
    const user: User = {
      id: this.ids.next(ID_PREFIX.user),
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      title: parsed.data.title,
      status: parsed.data.status,
      roles: parsed.data.roles,
      deskIds: parsed.data.deskIds,
      avatarColor: parsed.data.avatarColor ?? "#2563eb",
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.users.create(user);
    await this.audit.record({
      action: "user.created",
      actor: actorOf(principal),
      targetType: "User",
      targetId: created.id,
      portfolioId: null,
      deskId: null,
      summary: `Created user ${created.name} (${created.roles.join(", ")})`,
      data: { email: created.email, roles: created.roles, deskIds: created.deskIds },
      ip: null,
    });
    return created;
  }

  /** Requires users:manage. Partial update with validation; audits user.updated with the changed keys. */
  async update(principal: Principal, id: string, input: UpdateUserInput): Promise<User> {
    requirePermission(principal, "users:manage");
    const parsed = UpdateUserInput.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid user update", parsed.error.flatten());
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundError("User", id);
    if (parsed.data.email && parsed.data.email.toLowerCase() !== existing.email.toLowerCase()) {
      const clash = await this.users.findByEmail(parsed.data.email);
      if (clash && clash.id !== id) throw new ConflictError(`A user with email '${parsed.data.email}' already exists`);
    }
    const patch: Partial<Omit<User, "id" | "createdAt">> = { ...parsed.data, updatedAt: this.clock.nowIso() };
    if (patch.email) patch.email = patch.email.toLowerCase();
    const updated = await this.users.update(id, patch);
    await this.audit.record({
      action: "user.updated",
      actor: actorOf(principal),
      targetType: "User",
      targetId: id,
      portfolioId: null,
      deskId: null,
      summary: `Updated user ${updated.name}`,
      data: { changed: Object.keys(parsed.data) },
      ip: null,
    });
    return updated;
  }

  /** Roles from the repository, falling back to the static ROLE_CATALOG when nothing is seeded. */
  async listRoles(): Promise<Role[]> {
    const stored = await this.roles.list();
    if (stored.length > 0) return stored;
    return ROLE_CATALOG.map((r) => ({ id: `${ID_PREFIX.role}_${r.key}`, ...r }));
  }
}
