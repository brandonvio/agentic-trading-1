import type { Paged, PageQuery } from "@/lib/domain/common";
import type { Principal } from "@/lib/domain/auth";
import type { Desk } from "@/lib/domain/org";
import type { DeskRepository } from "@/lib/repositories/interfaces";
import { NotFoundError } from "@/lib/core/errors";
import type { DeskService } from "./interfaces";
import { assertDeskVisible, requirePermission, visibleDeskIds } from "./authz";

/** Desk lookups scoped to the principal's visibility. */
export class DeskServiceImpl implements DeskService {
  constructor(private readonly desks: DeskRepository) {}

  /** Requires desks:read and desk visibility. */
  async get(principal: Principal, id: string): Promise<Desk> {
    requirePermission(principal, "desks:read");
    const desk = await this.desks.findById(id);
    if (!desk) throw new NotFoundError("Desk", id);
    assertDeskVisible(principal, desk.id);
    return desk;
  }

  /** Requires desks:read. Global roles see all desks; others only their memberships. */
  async list(principal: Principal, page: PageQuery): Promise<Paged<Desk>> {
    requirePermission(principal, "desks:read");
    if (principal.allDesks) return this.desks.list(page);
    const mine = await this.desks.listByIds(principal.deskIds);
    return { items: mine.slice(page.offset, page.offset + page.limit), total: mine.length, limit: page.limit, offset: page.offset };
  }

  async visibleDeskIds(principal: Principal): Promise<string[] | "all"> {
    return visibleDeskIds(principal);
  }
}
