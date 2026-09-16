/** Roles, users and desks. */
import { ROLE_CATALOG } from "@/lib/auth/permissions";
import type { Role, User, RoleKey } from "@/lib/domain/auth";
import type { Desk, DeskStrategyFocus } from "@/lib/domain/org";
import { ID_PREFIX } from "@/lib/core/ids";
import type { SeedContext } from "../context";

export type DeskCode = "GM" | "EQD" | "SYS" | "DA" | "EV";

export interface OrgBundle {
  roles: Role[];
  users: User[];
  desks: Desk[];
  /** Lookup helpers. */
  userByEmail: (email: string) => User;
  deskByCode: (code: DeskCode) => Desk;
}

interface UserSpec {
  email: string;
  name: string;
  title: string;
  roles: RoleKey[];
  desks: DeskCode[];
  avatarColor: string;
  lastLoginHoursAgo: number;
}

const USER_SPECS: readonly UserSpec[] = [
  { email: "admin@agenticprop.io", name: "Ava Sterling", title: "Head of Platform Engineering", roles: ["global_admin"], desks: [], avatarColor: "#0f172a", lastLoginHoursAgo: 0.4 },
  { email: "marcus.okonkwo@agenticprop.io", name: "Marcus Okonkwo", title: "Chief Investment Officer", roles: ["cio"], desks: [], avatarColor: "#7c3aed", lastLoginHoursAgo: 1.2 },
  { email: "elena.varga@agenticprop.io", name: "Elena Varga", title: "Portfolio Manager, Global Macro", roles: ["portfolio_manager"], desks: ["GM"], avatarColor: "#2563eb", lastLoginHoursAgo: 0.7 },
  { email: "daniel.reyes@agenticprop.io", name: "Daniel Reyes", title: "Portfolio Manager, Equity Derivatives", roles: ["portfolio_manager"], desks: ["EQD"], avatarColor: "#0891b2", lastLoginHoursAgo: 2.5 },
  { email: "priya.raghunathan@agenticprop.io", name: "Priya Raghunathan", title: "Portfolio Manager, Systematic Futures", roles: ["portfolio_manager"], desks: ["SYS"], avatarColor: "#059669", lastLoginHoursAgo: 3.1 },
  { email: "kenji.watanabe@agenticprop.io", name: "Kenji Watanabe", title: "Head of Digital Assets", roles: ["portfolio_manager", "trader"], desks: ["DA"], avatarColor: "#d97706", lastLoginHoursAgo: 0.9 },
  { email: "sofia.marchetti@agenticprop.io", name: "Sofia Marchetti", title: "Head of Event Driven", roles: ["portfolio_manager"], desks: ["EV"], avatarColor: "#db2777", lastLoginHoursAgo: 5.4 },
  { email: "liam.oconnor@agenticprop.io", name: "Liam O'Connor", title: "Senior Trader, Global Macro", roles: ["trader"], desks: ["GM"], avatarColor: "#1d4ed8", lastLoginHoursAgo: 0.3 },
  { email: "nadia.hassan@agenticprop.io", name: "Nadia Hassan", title: "Options Trader", roles: ["trader"], desks: ["EQD"], avatarColor: "#0e7490", lastLoginHoursAgo: 1.8 },
  { email: "tomas.lindqvist@agenticprop.io", name: "Tomas Lindqvist", title: "Digital Assets Trader", roles: ["trader"], desks: ["DA"], avatarColor: "#b45309", lastLoginHoursAgo: 4.2 },
  { email: "wei.zhang@agenticprop.io", name: "Wei Zhang", title: "Senior Quantitative Researcher", roles: ["quant_researcher"], desks: ["SYS", "GM"], avatarColor: "#047857", lastLoginHoursAgo: 6.5 },
  { email: "isabelle.fournier@agenticprop.io", name: "Isabelle Fournier", title: "Quantitative Researcher", roles: ["quant_researcher"], desks: ["EQD", "DA"], avatarColor: "#0369a1", lastLoginHoursAgo: 22 },
  { email: "rachel.goldberg@agenticprop.io", name: "Rachel Goldberg", title: "Chief Risk Officer", roles: ["risk_manager"], desks: [], avatarColor: "#b91c1c", lastLoginHoursAgo: 0.2 },
  { email: "samuel.adeyemi@agenticprop.io", name: "Samuel Adeyemi", title: "Head of Compliance", roles: ["compliance_officer"], desks: [], avatarColor: "#4338ca", lastLoginHoursAgo: 2.1 },
  { email: "grace.kim@agenticprop.io", name: "Grace Kim", title: "Head of Trading Operations", roles: ["operations"], desks: [], avatarColor: "#6d28d9", lastLoginHoursAgo: 0.6 },
  { email: "oliver.bennett@agenticprop.io", name: "Oliver Bennett", title: "Investment Analyst", roles: ["analyst"], desks: ["GM", "EV"], avatarColor: "#475569", lastLoginHoursAgo: 27 },
];

interface DeskSpec {
  code: DeskCode;
  name: string;
  focus: DeskStrategyFocus;
  capitalAllocation: number;
  headEmail: string;
}

const DESK_SPECS: readonly DeskSpec[] = [
  { code: "GM", name: "Global Macro", focus: "global_macro", capitalAllocation: 1_550_000_000, headEmail: "elena.varga@agenticprop.io" },
  { code: "EQD", name: "Equity Derivatives", focus: "equity_derivatives", capitalAllocation: 750_000_000, headEmail: "daniel.reyes@agenticprop.io" },
  { code: "SYS", name: "Systematic Futures", focus: "futures_systematic", capitalAllocation: 850_000_000, headEmail: "priya.raghunathan@agenticprop.io" },
  { code: "DA", name: "Digital Assets", focus: "digital_assets", capitalAllocation: 700_000_000, headEmail: "kenji.watanabe@agenticprop.io" },
  { code: "EV", name: "Event Driven", focus: "event_driven", capitalAllocation: 350_000_000, headEmail: "sofia.marchetti@agenticprop.io" },
];

export function generateOrg(ctx: SeedContext): OrgBundle {
  const inception = ctx.daysAgo(400);

  const roles: Role[] = ROLE_CATALOG.map((r) => ({
    id: ctx.ids.next(ID_PREFIX.role),
    key: r.key,
    name: r.name,
    description: r.description,
    permissions: [...r.permissions],
  }));

  // Desks get ids first so users can reference them; head ids are patched after users exist.
  const deskIds = new Map<DeskCode, string>();
  for (const d of DESK_SPECS) deskIds.set(d.code, ctx.ids.next(ID_PREFIX.desk));

  const users: User[] = USER_SPECS.map((u, i) => ({
    id: ctx.ids.next(ID_PREFIX.user),
    email: u.email,
    name: u.name,
    title: u.title,
    status: "active",
    roles: u.roles,
    deskIds: u.desks.map((code) => deskIds.get(code) as string),
    avatarColor: u.avatarColor,
    lastLoginAt: ctx.hoursAgo(u.lastLoginHoursAgo),
    createdAt: ctx.daysAgo(400 - i * 3),
    updatedAt: ctx.daysAgo(ctx.rng.int(2, 40)),
  }));

  const userByEmail = (email: string): User => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`Seed generation error: unknown user ${email}`);
    return u;
  };

  const desks: Desk[] = DESK_SPECS.map((d) => ({
    id: deskIds.get(d.code) as string,
    code: d.code,
    name: d.name,
    focus: d.focus,
    baseCurrency: "USD",
    capitalAllocation: d.capitalAllocation,
    headUserId: userByEmail(d.headEmail).id,
    createdAt: inception,
    updatedAt: ctx.daysAgo(12),
  }));

  const deskByCode = (code: DeskCode): Desk => {
    const d = desks.find((x) => x.code === code);
    if (!d) throw new Error(`Seed generation error: unknown desk ${code}`);
    return d;
  };

  return { roles, users, desks, userByEmail, deskByCode };
}
