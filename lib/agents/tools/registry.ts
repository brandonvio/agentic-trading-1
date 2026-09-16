/**
 * Typed tool registry for agents.
 *
 * A tool is a zod-validated function exposed to the LLM as a JSON-schema
 * tool definition. `ToolRegistry.invoke` never throws: every failure
 * (unknown tool, not granted, permission denied, invalid input, runtime
 * error) is returned as a structured error so the agent can recover and the
 * runtime can persist it as a tool_result step.
 */
import { z } from "zod";
import type { Agent, AgentKind, AgentRun } from "@/lib/domain/agent";
import type { Permission, Principal } from "@/lib/domain/auth";
import type { Repositories } from "@/lib/repositories/interfaces";
import type { Clock } from "@/lib/core/clock";
import type { IdGenerator } from "@/lib/core/ids";
import type { Logger } from "@/lib/core/logger";
import { isAppError } from "@/lib/core/errors";
import { hasPermission } from "@/lib/auth/permissions";
import type { LLMToolDefinition } from "@/lib/llm/types";
import type { AgentServices } from "../services";

/** Everything a tool may touch. Tools call services (never repositories) except to persist their own artefacts. */
export interface ToolContext {
  agent: Agent;
  run: AgentRun;
  /** Synthetic principal for the agent: owner's permissions narrowed to the agent's tools. */
  principal: Principal;
  services: AgentServices;
  repos: Repositories;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  /** Ids created by tools during this run; the runtime copies them onto the AgentRun. */
  created: { signalIds: string[]; orderIds: string[] };
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  /** JSON schema exposed to the LLM; derived from `schema` when omitted. */
  inputSchema: Record<string, unknown>;
  /** Permission the agent principal must hold. */
  permission?: Permission;
  /** Agent kinds allowed to call this tool; undefined = all kinds. */
  kinds?: readonly AgentKind[];
  /** Whether advisory-autonomy agents may call it (default true). */
  allowAdvisory?: boolean;
  execute(input: TInput, ctx: ToolContext): Promise<unknown>;
}

export type ToolInvocationResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string; code: string; details?: unknown };

/** Author a tool with input types inferred from its zod schema. */
export function defineTool<S extends z.ZodType>(def: Omit<ToolDefinition<z.output<S>>, "inputSchema" | "schema"> & { schema: S; inputSchema?: Record<string, unknown> }): ToolDefinition<z.output<S>> {
  return { ...def, schema: def.schema as unknown as z.ZodType<z.output<S>>, inputSchema: def.inputSchema ?? zodToJsonSchema(def.schema) };
}

/** Convert a zod schema into the JSON schema shape the LLM gateway expects (`$schema` stripped). */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
    const { $schema: _omit, ...rest } = json;
    void _omit;
    return rest;
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): this {
    if (this.tools.has(def.name)) throw new Error(`Tool '${def.name}' is already registered`);
    this.tools.set(def.name, def);
    return this;
  }

  registerAll(defs: readonly ToolDefinition[]): this {
    for (const d of defs) this.register(d);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Permissions declared by the named tools (unknown names ignored). */
  permissionsFor(names: readonly string[]): Permission[] {
    const out = new Set<Permission>();
    for (const n of names) {
      const p = this.tools.get(n)?.permission;
      if (p) out.add(p);
    }
    return [...out];
  }

  /** LLM tool definitions for the named tools, in the order given; unknown names are skipped. */
  definitionsFor(names: readonly string[]): LLMToolDefinition[] {
    const out: LLMToolDefinition[] = [];
    for (const n of names) {
      const t = this.tools.get(n);
      if (t) out.push({ name: t.name, description: t.description, inputSchema: t.inputSchema });
    }
    return out;
  }

  /** Validate, authorise and execute a tool; never throws. */
  async invoke(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolInvocationResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, code: "UNKNOWN_TOOL", error: `Tool '${name}' does not exist` };
    if (!ctx.agent.tools.includes(name)) return { ok: false, code: "TOOL_NOT_GRANTED", error: `Tool '${name}' is not granted to agent '${ctx.agent.name}'` };
    if (tool.kinds && !tool.kinds.includes(ctx.agent.kind)) {
      return { ok: false, code: "TOOL_KIND_FORBIDDEN", error: `Tool '${name}' is not available to ${ctx.agent.kind} agents` };
    }
    if (tool.allowAdvisory === false && ctx.agent.autonomy === "advisory") {
      return { ok: false, code: "AUTONOMY_FORBIDDEN", error: `Tool '${name}' requires supervised or autonomous autonomy; agent is advisory` };
    }
    if (tool.permission && !hasPermission(ctx.principal, tool.permission)) {
      return { ok: false, code: "FORBIDDEN", error: `Agent principal lacks permission '${tool.permission}' required by '${name}'` };
    }
    const parsed = tool.schema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      return { ok: false, code: "VALIDATION_ERROR", error: `Invalid input for '${name}': ${issues.join("; ")}`, details: issues };
    }
    try {
      const output = await tool.execute(parsed.data, ctx);
      return { ok: true, output: output ?? null };
    } catch (e) {
      ctx.logger.warn("tool execution failed", { tool: name, runId: ctx.run.id, error: e instanceof Error ? e.message : String(e) });
      if (isAppError(e)) return { ok: false, code: e.code, error: e.message, details: e.details ?? undefined };
      return { ok: false, code: "TOOL_ERROR", error: e instanceof Error ? e.message : String(e) };
    }
  }
}
