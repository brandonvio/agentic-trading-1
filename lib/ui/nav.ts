import type { Permission, Principal } from "@/lib/domain/auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  DashboardIcon,
  PortfolioIcon,
  PositionsIcon,
  OrdersIcon,
  SignalsIcon,
  AgentsIcon,
  StrategiesIcon,
  RiskIcon,
  ApprovalsIcon,
  MarketIcon,
  BrokersIcon,
  AuditIcon,
  UsersIcon,
  type IconComponent,
} from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  /** Permission required to see the item; null = everyone. */
  permission: Permission | null;
  /** Optional group heading rendered above the item. */
  section?: string;
  /** Single-key shortcut hint shown in the sidebar (e.g. "g d"). */
  shortcut?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon, permission: null, shortcut: "g d" },
  { href: "/portfolios", label: "Portfolios", icon: PortfolioIcon, permission: "portfolios:read", shortcut: "g p" },
  { href: "/positions", label: "Positions", icon: PositionsIcon, permission: "positions:read" },
  { href: "/orders", label: "Orders", icon: OrdersIcon, permission: "orders:read", shortcut: "g o" },
  { href: "/signals", label: "Signals", icon: SignalsIcon, permission: "agents:read", section: "Intelligence" },
  { href: "/agents", label: "Agents", icon: AgentsIcon, permission: "agents:read", shortcut: "g a" },
  { href: "/strategies", label: "Strategies", icon: StrategiesIcon, permission: "strategies:read" },
  { href: "/risk", label: "Risk", icon: RiskIcon, permission: "risk:read", section: "Control", shortcut: "g r" },
  { href: "/approvals", label: "Approvals", icon: ApprovalsIcon, permission: "approvals:read" },
  { href: "/market", label: "Market", icon: MarketIcon, permission: "market:read", section: "Infrastructure" },
  { href: "/brokers", label: "Brokers", icon: BrokersIcon, permission: "brokers:read" },
  { href: "/audit", label: "Audit", icon: AuditIcon, permission: "audit:read" },
  { href: "/admin/users", label: "Users", icon: UsersIcon, permission: "users:read", section: "Admin" },
];

/** Nav items the principal may see. Pure; safe on server and client. */
export function visibleNavItems(principal: Principal | null | undefined, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  if (!principal) return items.filter((i) => i.permission === null);
  return items.filter((i) => i.permission === null || hasPermission(principal, i.permission));
}

/** True when `pathname` is the item's route or nested beneath it. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
