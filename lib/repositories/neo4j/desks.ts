import type { PageQuery, Paged } from "@/lib/domain/common";
import { Desk } from "@/lib/domain/org";
import type { DeskRepository } from "../interfaces";
import { NodeRepository, type RepoContext } from "./crud";
import type { NodeDef } from "./mapping";
import { relink } from "./links";

const def: NodeDef<Desk> = {
  label: "Desk",
  schema: Desk,
  jsonFields: [],
  hasUpdatedAt: true,
  links: (d) => [relink({ label: "Desk", id: d.id, rel: "HEADED_BY", targetLabels: ["User"], targetId: d.headUserId })],
};

export class Neo4jDeskRepository extends NodeRepository<Desk> implements DeskRepository {
  constructor(ctx: RepoContext) {
    super(ctx, def);
  }

  findById(id: string): Promise<Desk | null> {
    return this.findNodeById(id);
  }

  findByCode(code: string): Promise<Desk | null> {
    return this.findNodeBy("code", code);
  }

  list(page: PageQuery): Promise<Paged<Desk>> {
    return this.listNodes({ orderBy: "n.code ASC, n.id ASC" }, page);
  }

  listByIds(ids: string[]): Promise<Desk[]> {
    return this.findNodesByIds(ids, "n.code ASC");
  }

  create(desk: Desk): Promise<Desk> {
    return this.createNode(desk);
  }

  update(id: string, patch: Partial<Omit<Desk, "id" | "createdAt">>): Promise<Desk> {
    return this.updateNode(id, patch);
  }
}
