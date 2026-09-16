import type { Principal, User } from "@/lib/domain/auth";
import type { UserRepository } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import { UnauthorizedError } from "@/lib/core/errors";
import { principalFromUser } from "@/lib/auth/permissions";
import { decodeSession, encodeSession, newSessionPayload } from "@/lib/auth/session";
import type { AuthService, AuditService } from "./interfaces";
import { actorOf } from "./authz";

/** Mock authentication: users are identified by email only; sessions are stateless HMAC tokens. */
export class AuthServiceImpl implements AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Log a user in by email. The user must exist and be active. Records lastLoginAt and an auth.login audit event. */
  async login(email: string, ip?: string | null): Promise<{ user: User; principal: Principal; token: string; expiresAt: number }> {
    const found = await this.users.findByEmail(email);
    if (!found || found.status !== "active") throw new UnauthorizedError("Unknown or inactive user");
    const now = this.clock.nowIso();
    const user = await this.users.update(found.id, { lastLoginAt: now, updatedAt: now });
    const principal = principalFromUser(user);
    const payload = newSessionPayload(user.id, this.clock.now().getTime());
    const token = encodeSession(payload);
    await this.audit.record({
      action: "auth.login",
      actor: actorOf(principal),
      targetType: "User",
      targetId: user.id,
      portfolioId: null,
      deskId: null,
      summary: `${user.name} logged in`,
      data: { email: user.email, roles: user.roles },
      ip: ip ?? null,
    });
    return { user, principal, token, expiresAt: payload.expiresAt };
  }

  /** Records an auth.logout audit event; tokens are stateless so nothing else to revoke. */
  async logout(principal: Principal): Promise<void> {
    await this.audit.record({
      action: "auth.logout",
      actor: actorOf(principal),
      targetType: "User",
      targetId: principal.userId,
      portfolioId: null,
      deskId: null,
      summary: `${principal.name} logged out`,
      data: {},
      ip: null,
    });
  }

  /** Resolve a session token to the user + principal. Returns null for invalid, expired or inactive sessions. */
  async resolve(token: string | null | undefined): Promise<{ user: User; principal: Principal } | null> {
    const payload = decodeSession(token, this.clock.now().getTime());
    if (!payload) return null;
    const user = await this.users.findById(payload.userId);
    if (!user || user.status !== "active") return null;
    return { user, principal: principalFromUser(user) };
  }

  /** Active users shown on the mock login screen. */
  async listLoginCandidates(): Promise<Array<Pick<User, "id" | "email" | "name" | "title" | "roles" | "avatarColor">>> {
    const page = await this.users.list({ status: "active" }, { limit: 500, offset: 0 });
    return page.items.map((u) => ({ id: u.id, email: u.email, name: u.name, title: u.title, roles: u.roles, avatarColor: u.avatarColor }));
  }
}
