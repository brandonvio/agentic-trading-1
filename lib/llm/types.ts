/**
 * LLM gateway contract. Agents talk to an `LLMProvider` through structured
 * messages and tool definitions; the provider is responsible for turning that
 * into a model call. `MockLLMProvider` returns deterministic, scenario-aware
 * completions so the whole platform runs offline; `AnthropicProvider` is the
 * production implementation stub.
 */
export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMTextBlock {
  type: "text";
  text: string;
}

export interface LLMToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type LLMContentBlock = LLMTextBlock | LLMToolUseBlock | LLMToolResultBlock;

export interface LLMMessage {
  role: LLMRole;
  content: string | LLMContentBlock[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface LLMCompletionRequest {
  model: string;
  system: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  /** Free-form metadata forwarded to the provider (agent id, run id) for tracing. */
  metadata?: Record<string, string>;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface LLMCompletion {
  id: string;
  model: string;
  content: LLMContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: LLMUsage;
}

export interface LLMProvider {
  readonly name: string;
  complete(req: LLMCompletionRequest): Promise<LLMCompletion>;
  /** Cheap structured-output helper for non-agentic calls (summaries, classifications). */
  completeJson<T>(req: Omit<LLMCompletionRequest, "tools"> & { schemaName: string }): Promise<{ value: T; usage: LLMUsage }>;
}

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const DEFAULT_MODEL = "claude-fable-5-1";

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-fable-5-1": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}
