import { PERMISSIONS, type Permission, type RoleKey, type Role, type User, type Principal } from "@/lib/domain/auth";

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Role → permission matrix. This is the single source of truth for RBAC.
 * Roles are additive: a user with several roles gets the union.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  global_admin: ALL,

  cio: [
    "users:read",
    "audit:read",
    "desks:read",
    "desks:manage",
    "portfolios:read",
    "portfolios:manage",
    "positions:read",
    "positions:close",
    "orders:read",
    "orders:create",
    "orders:cancel",
    "orders:approve",
    "orders:override-risk",
    "strategies:read",
    "strategies:create",
    "strategies:deploy",
    "strategies:pause",
    "agents:read",
    "agents:run",
    "agents:configure",
    "agents:kill",
    "risk:read",
    "risk:limits:write",
    "risk:breaches:resolve",
    "approvals:read",
    "approvals:decide",
    "brokers:read",
    "market:read",
    "research:read",
    "research:backtest",
  ],

  portfolio_manager: [
    "users:read",
    "desks:read",
    "portfolios:read",
    "portfolios:manage",
    "positions:read",
    "positions:close",
    "orders:read",
    "orders:create",
    "orders:cancel",
    "orders:approve",
    "strategies:read",
    "strategies:create",
    "strategies:deploy",
    "strategies:pause",
    "agents:read",
    "agents:run",
    "agents:configure",
    "agents:kill",
    "risk:read",
    "approvals:read",
    "approvals:decide",
    "brokers:read",
    "market:read",
    "research:read",
    "research:backtest",
  ],

  trader: [
    "desks:read",
    "portfolios:read",
    "positions:read",
    "positions:close",
    "orders:read",
    "orders:create",
    "orders:cancel",
    "strategies:read",
    "agents:read",
    "agents:run",
    "risk:read",
    "approvals:read",
    "brokers:read",
    "market:read",
    "research:read",
  ],

  quant_researcher: [
    "desks:read",
    "portfolios:read",
    "positions:read",
    "orders:read",
    "strategies:read",
    "strategies:create",
    "agents:read",
    "agents:run",
    "agents:configure",
    "risk:read",
    "market:read",
    "research:read",
    "research:backtest",
  ],

  risk_manager: [
    "users:read",
    "audit:read",
    "desks:read",
    "portfolios:read",
    "positions:read",
    "positions:close",
    "orders:read",
    "orders:cancel",
    "orders:override-risk",
    "strategies:read",
    "strategies:pause",
    "agents:read",
    "agents:kill",
    "risk:read",
    "risk:limits:write",
    "risk:breaches:resolve",
    "approvals:read",
    "approvals:decide",
    "brokers:read",
    "market:read",
    "research:read",
  ],

  compliance_officer: [
    "users:read",
    "audit:read",
    "desks:read",
    "portfolios:read",
    "positions:read",
    "orders:read",
    "strategies:read",
    "agents:read",
    "agents:kill",
    "risk:read",
    "approvals:read",
    "approvals:decide",
    "brokers:read",
    "market:read",
  ],

  operations: [
    "users:read",
    "audit:read",
    "desks:read",
    "portfolios:read",
    "positions:read",
    "orders:read",
    "strategies:read",
    "agents:read",
    "risk:read",
    "approvals:read",
    "brokers:read",
    "brokers:manage",
    "market:read",
  ],

  analyst: [
    "desks:read",
    "portfolios:read",
    "positions:read",
    "orders:read",
    "strategies:read",
    "agents:read",
    "risk:read",
    "approvals:read",
    "brokers:read",
    "market:read",
    "research:read",
  ],
};

export const ROLE_CATALOG: Array<Omit<Role, "id">> = [
  { key: "global_admin", name: "Global Administrator", description: "Unrestricted access to every capability, desk and portfolio.", permissions: [...ROLE_PERMISSIONS.global_admin] },
  { key: "cio", name: "Chief Investment Officer", description: "Allocates capital, approves deployments and large trades, sees all desks.", permissions: [...ROLE_PERMISSIONS.cio] },
  { key: "portfolio_manager", name: "Portfolio Manager", description: "Owns portfolios on a desk; runs and configures agents; approves desk trades.", permissions: [...ROLE_PERMISSIONS.portfolio_manager] },
  { key: "trader", name: "Trader", description: "Executes and cancels orders within desk mandates; can trigger agents.", permissions: [...ROLE_PERMISSIONS.trader] },
  { key: "quant_researcher", name: "Quant Researcher", description: "Designs strategies, runs backtests and research agents; no execution rights.", permissions: [...ROLE_PERMISSIONS.quant_researcher] },
  { key: "risk_manager", name: "Risk Manager", description: "Sets limits, resolves breaches, can halt agents and cancel orders platform-wide.", permissions: [...ROLE_PERMISSIONS.risk_manager] },
  { key: "compliance_officer", name: "Compliance Officer", description: "Reviews audit trails and approvals; can halt agents; read-only elsewhere.", permissions: [...ROLE_PERMISSIONS.compliance_officer] },
  { key: "operations", name: "Operations", description: "Manages broker connectivity and platform health; read-only on trading.", permissions: [...ROLE_PERMISSIONS.operations] },
  { key: "analyst", name: "Analyst", description: "Read-only access to portfolios, strategies, agents and risk.", permissions: [...ROLE_PERMISSIONS.analyst] },
];

export const ALL_DESK_ROLES: readonly RoleKey[] = ["global_admin", "cio", "risk_manager", "compliance_officer", "operations"];

export function permissionsForRoles(roles: readonly RoleKey[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

export function principalFromUser(user: User): Principal {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    permissions: permissionsForRoles(user.roles),
    deskIds: user.deskIds,
    allDesks: user.roles.some((r) => ALL_DESK_ROLES.includes(r)),
  };
}

export function hasPermission(p: Principal, perm: Permission): boolean {
  return p.permissions.includes(perm);
}

export function hasAnyPermission(p: Principal, perms: readonly Permission[]): boolean {
  return perms.some((x) => p.permissions.includes(x));
}

export function canAccessDesk(p: Principal, deskId: string | null | undefined): boolean {
  if (p.allDesks) return true;
  if (!deskId) return false;
  return p.deskIds.includes(deskId);
}
