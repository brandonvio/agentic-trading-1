import { expect, type Page } from "@playwright/test";

/** Seeded identities, one per role, used to drive the role-based journeys. */
export const USERS = {
  admin: { email: "admin@agenticprop.io", name: "Ava Sterling" },
  cio: { email: "marcus.okonkwo@agenticprop.io", name: "Marcus Okonkwo" },
  pm: { email: "elena.varga@agenticprop.io", name: "Elena Varga" },
  trader: { email: "liam.oconnor@agenticprop.io", name: "Liam O'Connor" },
  quant: { email: "isabelle.fournier@agenticprop.io", name: "Isabelle Fournier" },
  risk: { email: "rachel.goldberg@agenticprop.io", name: "Rachel Goldberg" },
  compliance: { email: "samuel.adeyemi@agenticprop.io", name: "Samuel Adeyemi" },
  ops: { email: "grace.kim@agenticprop.io", name: "Grace Kim" },
  analyst: { email: "oliver.bennett@agenticprop.io", name: "Oliver Bennett" },
} as const;

export type UserKey = keyof typeof USERS;

/** Sign in through the email form and wait for the terminal to load. */
export async function login(page: Page, user: UserKey): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/work email/i).fill(USERS[user].email);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.goto("/dashboard");
  const menu = page.getByRole("button", { name: /account menu|user menu/i }).first();
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const signOut = page.getByRole("button", { name: /sign out|log out/i }).first();
  if (await signOut.isVisible().catch(() => false)) await signOut.click();
}

/** Assert the page rendered its shell rather than an error boundary. */
export async function expectRendered(page: Page): Promise<void> {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/application error|unhandled runtime error/i)).toHaveCount(0);
}

/** Nav labels visible in the sidebar for the current session. */
export async function navLabels(page: Page): Promise<string[]> {
  const links = page.locator("nav a");
  return (await links.allInnerTexts()).map((t) => t.split("\n")[0].trim()).filter(Boolean);
}
