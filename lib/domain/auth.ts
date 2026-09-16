import { z } from "zod";
import { IsoDateTime, Timestamped } from "./common";

/**
 * Permission catalogue. Format: `<resource>:<action>`.
 * Keep this list exhaustive; the RBAC matrix in lib/auth/permissions.ts
 * maps roles onto subsets of it.
 */
export const PERMISSIONS = [
  // platform
  "platform:admin",
  "users:read",
  "users:manage",
  "audit:read",
  // organisation
  "desks:read",
  "desks:manage",
  // portfolio & positions
  "portfolios:read",
  "portfolios:manage",
  "positions:read",
  "positions:close",
  // orders
  "orders:read",
  "orders:create",
  "orders:cancel",
  "orders:approve",
  "orders:override-risk",
  // strategies
  "strategies:read",
  "strategies:create",
  "strategies:deploy",
  "strategies:pause",
  // agents
  "agents:read",
  "agents:run",
  "agents:configure",
  "agents:kill",
  // risk
  "risk:read",
  "risk:limits:write",
  "risk:breaches:resolve",
  // compliance / approvals
  "approvals:read",
  "approvals:decide",
  // brokers & market data
  "brokers:read",
  "brokers:manage",
  "market:read",
  // research
  "research:read",
  "research:backtest",
] as const;

export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

export const ROLE_KEYS = [
  "global_admin",
  "cio",
  "portfolio_manager",
  "trader",
  "quant_researcher",
  "risk_manager",
  "compliance_officer",
  "operations",
  "analyst",
] as const;
export const RoleKey = z.enum(ROLE_KEYS);
export type RoleKey = z.infer<typeof RoleKey>;

export const Role = z.object({
  id: z.string(),
  key: RoleKey,
  name: z.string(),
  description: z.string(),
  permissions: z.array(Permission),
});
export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(["active", "suspended", "invited"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const User = Timestamped.extend({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  title: z.string(),
  status: UserStatus,
  roles: z.array(RoleKey).min(1),
  /** Desk ids the user is a member of; global_admin/cio see all desks regardless. */
  deskIds: z.array(z.string()),
  avatarColor: z.string().default("#2563eb"),
  lastLoginAt: IsoDateTime.nullable().default(null),
});
export type User = z.infer<typeof User>;

export const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  title: z.string().min(1),
  roles: z.array(RoleKey).min(1),
  deskIds: z.array(z.string()).default([]),
  status: UserStatus.default("active"),
  avatarColor: z.string().optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = CreateUserInput.partial();
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** The authenticated principal attached to every request/service call. */
export interface Principal {
  userId: string;
  email: string;
  name: string;
  roles: RoleKey[];
  permissions: Permission[];
  deskIds: string[];
  /** Whether the principal sees every desk (admin / CIO). */
  allDesks: boolean;
}

/** Actor identity for audit purposes: a human user or an autonomous agent. */
export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: z.string(), name: z.string() }),
  z.object({ kind: z.literal("agent"), id: z.string(), name: z.string(), runId: z.string().optional() }),
  z.object({ kind: z.literal("system"), id: z.literal("system"), name: z.literal("system") }),
]);
export type Actor = z.infer<typeof Actor>;

export const SYSTEM_ACTOR: Actor = { kind: "system", id: "system", name: "system" };
