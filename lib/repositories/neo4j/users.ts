import type { PageQuery, Paged } from "@/lib/domain/common";
import { User, type RoleKey } from "@/lib/domain/auth";
import type { UserRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relinkMany } from "./links";

const def: NodeDef<User> = {
  label: "User",
  schema: User,
  jsonFields: [],
  hasUpdatedAt: true,
  links: (u) => [
    relinkMany({ label: "User", id: u.id, rel: "HAS_ROLE", targetLabels: ["Role"], matchProp: "key", targets: u.roles.map((r) => ({ targetId: r })) }),
    relinkMany({ label: "User", id: u.id, rel: "MEMBER_OF", targetLabels: ["Desk"], targets: u.deskIds.map((d) => ({ targetId: d })) }),
  ],
};

export class Neo4jUserRepository extends NodeRepository<User> implements UserRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<User | null> {
    return this.findNodeById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findNodeBy("email", email);
  }

  list(filter: { deskId?: string; role?: RoleKey; status?: User["status"] }, page: PageQuery): Promise<Paged<User>> {
    const where = new Where()
      .when(filter.deskId !== undefined, "$deskId IN n.deskIds", { deskId: filter.deskId })
      .when(filter.role !== undefined, "$role IN n.roles", { role: filter.role })
      .eq("status", filter.status);
    return this.listNodes({ where, orderBy: "n.name ASC, n.id ASC" }, page);
  }

  create(user: User): Promise<User> {
    return this.createNode(user);
  }

  update(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    return this.updateNode(id, patch);
  }

  delete(id: string): Promise<void> {
    return this.deleteNode(id);
  }
}
