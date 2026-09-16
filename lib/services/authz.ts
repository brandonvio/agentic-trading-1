/**
 * Authorization helpers shared by every application service.
 *
 * Services receive a `Principal` and are responsible for both permission
 * checks and desk/portfolio visibility. These helpers keep that logic in one
 * place so each service reads as business rules only.
 */
import type { Permission, Principal } from "@/lib/domain/auth";
import type { Portfolio } from "@/lib/domain/portfolio";
import { ForbiddenError, NotFoundError } from "@/lib/core/errors";
import { canAccessDesk, hasAnyPermission, hasPermission } from "@/lib/auth/permissions";
import type { PortfolioRepository } from "@/lib/repositories/interfaces";

/** Throw ForbiddenError unless the principal holds `perm`. */
export function requirePermission(principal: Principal, perm: Permission): void {
  if (!hasPermission(principal, perm)) throw new ForbiddenError(`Requires permission '${perm}'`, { required: [perm] });
}

/** Throw ForbiddenError unless the principal holds at least one of `perms`. */
export function requireAnyPermission(principal: Principal, perms: readonly Permission[]): void {
  if (!hasAnyPermission(principal, perms)) throw new ForbiddenError(`Requires one of: ${perms.join(", ")}`, { required: [...perms] });
}

/** Throw ForbiddenError unless the principal can see the desk. */
export function assertDeskVisible(principal: Principal, deskId: string | null | undefined): void {
  if (!canAccessDesk(principal, deskId)) throw new ForbiddenError("Desk is not visible to this principal", { deskId: deskId ?? null });
}

/** Visible desk ids: "all" for global roles, otherwise the principal's desk membership. */
export function visibleDeskIds(principal: Principal): string[] | "all" {
  return principal.allDesks ? "all" : [...principal.deskIds];
}

/** The page query used when a service needs "everything" from a repository. */
export const ALL_ROWS = { limit: 10_000, offset: 0 } as const;

/**
 * Computes the set of portfolios a principal may see, and provides small
 * helpers to turn that into repository filters.
 */
export class PortfolioScope {
  constructor(private readonly portfolios: PortfolioRepository) {}

  /** Portfolio ids visible to the principal, or "all" for principals that see every desk. */
  async visibleIds(principal: Principal): Promise<string[] | "all"> {
    if (principal.allDesks) return "all";
    if (principal.deskIds.length === 0) return [];
    const page = await this.portfolios.list({ deskIds: principal.deskIds }, ALL_ROWS);
    return page.items.map((p) => p.id);
  }

  /** All visible portfolios (entities). */
  async visiblePortfolios(principal: Principal): Promise<Portfolio[]> {
    if (principal.allDesks) return (await this.portfolios.list({}, ALL_ROWS)).items;
    if (principal.deskIds.length === 0) return [];
    return (await this.portfolios.list({ deskIds: principal.deskIds }, ALL_ROWS)).items;
  }

  /**
   * Repository filter fragment: `{}` when the principal sees everything,
   * `{ portfolioIds }` otherwise. When `requestedPortfolioId` is given it must
   * be visible (ForbiddenError) and is returned as `{ portfolioId }`.
   */
  async filter(principal: Principal, requestedPortfolioId?: string): Promise<{ portfolioId?: string; portfolioIds?: string[] }> {
    if (requestedPortfolioId) {
      await this.assertVisibleId(principal, requestedPortfolioId);
      return { portfolioId: requestedPortfolioId };
    }
    const ids = await this.visibleIds(principal);
    return ids === "all" ? {} : { portfolioIds: ids };
  }

  /** Load a portfolio and assert desk visibility (NotFoundError / ForbiddenError). */
  async load(principal: Principal, portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.portfolios.findById(portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);
    assertDeskVisible(principal, portfolio.deskId);
    return portfolio;
  }

  /** Assert a portfolio id is visible to the principal without returning it. */
  async assertVisibleId(principal: Principal, portfolioId: string): Promise<void> {
    await this.load(principal, portfolioId);
  }

  /** Assert visibility of an already-loaded portfolio. */
  assertVisible(principal: Principal, portfolio: Portfolio): void {
    assertDeskVisible(principal, portfolio.deskId);
  }
}

/** Build a user Actor from a principal for audit purposes. */
export function actorOf(principal: Principal): { kind: "user"; id: string; name: string } {
  return { kind: "user", id: principal.userId, name: principal.name };
}
