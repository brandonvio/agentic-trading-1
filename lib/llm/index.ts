/**
 * LLM gateway entry point: provider factory + DI registration.
 */
import type { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import type { LLMProvider } from "./types";
import { MockLLMProvider, type MockLLMProviderOptions } from "./mock-provider";
import { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic-provider";

export type LLMProviderKind = "mock" | "anthropic";

export interface CreateLLMProviderOptions {
  mock?: MockLLMProviderOptions;
  anthropic?: AnthropicProviderOptions;
}

/** Instantiate a provider by kind. */
export function createLLMProvider(kind: LLMProviderKind, opts: CreateLLMProviderOptions = {}): LLMProvider {
  return kind === "anthropic" ? new AnthropicProvider(opts.anthropic) : new MockLLMProvider(opts.mock);
}

/** Resolve the provider kind from the environment (`LLM_PROVIDER=anthropic` opts in; anything else is mock). */
export function llmProviderKindFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProviderKind {
  return env.LLM_PROVIDER === "anthropic" ? "anthropic" : "mock";
}

/** Bind `TOKENS.llm`. */
export function registerLLM(c: Container, kind: LLMProviderKind = llmProviderKindFromEnv()): void {
  c.register(TOKENS.llm, () => createLLMProvider(kind));
}

export * from "./types";
export { MockLLMProvider } from "./mock-provider";
export type { MockLLMProviderOptions, QueuedCompletion } from "./mock-provider";
export { AnthropicProvider } from "./anthropic-provider";
export type { AnthropicProviderOptions } from "./anthropic-provider";
export { buildSystemPrompt, buildUserMessage, outputContractFor, agentKindMarker, parseAgentKindMarker, isAgentKind } from "./prompts";
export type { PromptContext } from "./prompts";
export { extractJsonBlock, fenceJson, estimateTokens } from "./json";
export { createPrng, hashString } from "./prng";
export type { Prng } from "./prng";
export { DEFAULT_SCENARIOS } from "./mock-scenarios";
export type { MockScenario, MockTurnContext, PlannedCall, OutputBuilder, RecordedToolCall } from "./mock-scenarios";
