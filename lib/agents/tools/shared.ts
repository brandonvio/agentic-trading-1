/** Helpers shared by tool implementations. */
import { z } from "zod";
import type { Actor } from "@/lib/domain/auth";
import { ValidationError } from "@/lib/core/errors";
import type { ToolContext } from "./registry";

export const PortfolioIdInput = z.string().min(1).optional().describe("Portfolio id; defaults to the agent's own portfolio scope.");

/** Resolve the portfolio a tool should act on, enforcing the agent's scope. */
export function resolvePortfolioId(ctx: ToolContext, requested?: string | null): string {
  const scoped = ctx.agent.portfolioId;
  if (requested && scoped && requested !== scoped) {
    throw new ValidationError(`Portfolio '${requested}' is outside this agent's scope ('${scoped}')`);
  }
  const id = requested ?? scoped;
  if (!id) throw new ValidationError("portfolioId is required for a platform-wide agent");
  return id;
}

export function agentActor(ctx: ToolContext): Actor {
  return { kind: "agent", id: ctx.agent.id, name: ctx.agent.name, runId: ctx.run.id };
}

/** Add `hours` to an ISO timestamp. */
export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}
