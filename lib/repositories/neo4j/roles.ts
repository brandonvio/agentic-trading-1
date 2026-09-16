import { Role, type RoleKey } from "@/lib/domain/auth";
import type { RoleRepository } from "../interfaces";
import { NodeRepository, Where, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relinkMany } from "./links";

const def: NodeDef<Role> = {
  label: "Role",
  schema: Role,
  jsonFields: [],
  hasUpdatedAt: false,
  links: (r) => [
    relinkMany({
      label: "Role",
      id: r.id,
      rel: "GRANTS",
      targetLabels: ["Permission"],
      matchProp: "key",
      targets: r.permissions.map((p) => ({ targetId: p })),
    }),
  ],
};

export class Neo4jRoleRepository extends NodeRepository<Role> implements RoleRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findByKey(key: RoleKey): Promise<Role | null> {
    return this.findNodeBy("key", key);
  }

  list(): Promise<Role[]> {
    return this.findNodes(new Where(), "n.key ASC");
  }

  /** Upsert keyed on `key` (the role id is kept from the first insert unless overwritten). */
  upsert(role: Role): Promise<Role> {
    return this.createNode(role, "key");
  }
}
