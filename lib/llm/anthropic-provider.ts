/**
 * Production LLM provider targeting the Anthropic Messages API.
 *
 * Deliberately dependency-free: it speaks the REST contract over the injected
 * `fetch` so the platform stays offline-capable. When no API key is configured
 * every call throws `LLMError("not configured")`, which the runtime records
 * as a failed run rather than crashing the process.
 */
import { LLMError } from "@/lib/core/errors";
import { SystemClock, type Clock } from "@/lib/core/clock";
import type {
  LLMCompletion,
  LLMCompletionRequest,
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMUsage,
} from "./types";
import { DEFAULT_MODEL, estimateCostUsd } from "./types";
import { extractJsonBlock } from "./json";

export interface AnthropicProviderOptions {
  apiKey?: string | null;
  baseUrl?: string;
  /** API version header; the Messages API is stable under this value. */
  apiVersion?: string;
  fetchFn?: typeof fetch;
  clock?: Clock;
  defaultMaxTokens?: number;
}

type WireRole = "user" | "assistant";

type WireBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

interface WireMessage {
  role: WireRole;
  content: WireBlock[];
}

interface WireRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: WireMessage[];
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  metadata?: { user_id?: string };
}

interface WireResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

const STOP_REASONS: ReadonlySet<LLMCompletion["stopReason"]> = new Set(["end_turn", "tool_use", "max_tokens", "stop_sequence"]);

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchFn: typeof fetch;
  private readonly clock: Clock;
  private readonly defaultMaxTokens: number;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    this.baseUrl = (opts.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
    this.apiVersion = opts.apiVersion ?? "2023-06-01";
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
    this.clock = opts.clock ?? new SystemClock();
    this.defaultMaxTokens = opts.defaultMaxTokens ?? 8192;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletion> {
    if (!this.apiKey) throw new LLMError("Anthropic provider not configured: set ANTHROPIC_API_KEY or use LLM_PROVIDER=mock");
    if (typeof this.fetchFn !== "function") throw new LLMError("No fetch implementation available for AnthropicProvider");

    const body = toWireRequest(req, this.defaultMaxTokens);
    const started = this.clock.now().getTime();
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": this.apiVersion },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new LLMError(`Anthropic request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new LLMError(`Anthropic API error ${response.status}`, { status: response.status, body: text.slice(0, 2000) });
    }
    const wire = (await response.json()) as WireResponse;
    const latencyMs = this.clock.now().getTime() - started;
    return fromWireResponse(wire, req.model || DEFAULT_MODEL, latencyMs);
  }

  async completeJson<T>(req: Omit<LLMCompletionRequest, "tools"> & { schemaName: string }): Promise<{ value: T; usage: LLMUsage }> {
    const system = `${req.system}\n\nRespond with a single fenced \`\`\`json block matching the "${req.schemaName}" schema and nothing else.`;
    const completion = await this.complete({ ...req, system, tools: undefined });
    const text = completion.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const value = extractJsonBlock(text);
    if (!value) throw new LLMError(`Anthropic response for schema "${req.schemaName}" contained no JSON object`, { text: text.slice(0, 500) });
    return { value: value as T, usage: completion.usage };
  }
}

/** Map the gateway request onto the Messages API wire format. */
export function toWireRequest(req: LLMCompletionRequest, defaultMaxTokens: number): WireRequest {
  const systemParts = [req.system];
  const messages: WireMessage[] = [];
  for (const m of req.messages) {
    if (m.role === "system") {
      systemParts.push(typeof m.content === "string" ? m.content : m.content.map((b) => (b.type === "text" ? b.text : "")).join("\n"));
      continue;
    }
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: toWireBlocks(m) });
  }
  const out: WireRequest = {
    model: req.model || DEFAULT_MODEL,
    max_tokens: req.maxTokens ?? defaultMaxTokens,
    system: systemParts.filter(Boolean).join("\n\n"),
    messages,
  };
  if (req.tools?.length) out.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const userId = req.metadata?.agentId ?? req.metadata?.runId;
  if (userId) out.metadata = { user_id: userId };
  return out;
}

function toWireBlocks(m: LLMMessage): WireBlock[] {
  if (typeof m.content === "string") return [{ type: "text", text: m.content }];
  return m.content.map((b): WireBlock => {
    switch (b.type) {
      case "text":
        return { type: "text", text: b.text };
      case "tool_use":
        return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
    }
  });
}

/** Map a Messages API response onto the gateway completion shape. */
export function fromWireResponse(wire: WireResponse, model: string, latencyMs: number): LLMCompletion {
  const content: LLMContentBlock[] = [];
  for (const b of wire.content ?? []) {
    if (b.type === "text" && typeof b.text === "string") content.push({ type: "text", text: b.text });
    else if (b.type === "tool_use" && b.id && b.name) content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} });
  }
  const stopReason = STOP_REASONS.has(wire.stop_reason as LLMCompletion["stopReason"]) ? (wire.stop_reason as LLMCompletion["stopReason"]) : "end_turn";
  const inputTokens = wire.usage?.input_tokens ?? 0;
  const outputTokens = wire.usage?.output_tokens ?? 0;
  return {
    id: wire.id,
    model: wire.model || model,
    content,
    stopReason,
    usage: { inputTokens, outputTokens, costUsd: estimateCostUsd(wire.model || model, inputTokens, outputTokens), latencyMs },
  };
}
