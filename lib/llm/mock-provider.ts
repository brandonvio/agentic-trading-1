/**
 * Deterministic, scenario-aware mock of the LLM gateway.
 *
 * Behaviour is a pure function of the request plus a seeded PRNG (latency
 * only): the provider recognises the agent kind (from `metadata.agentKind` or
 * the `[agent-kind: …]` marker in the system prompt), walks that kind's tool
 * plan one tool per turn, and once every planned tool has been answered it
 * emits an `end_turn` completion whose text ends in a fenced JSON block with
 * the agent's structured output.
 *
 * Tests can take full control with `enqueue()` / `enqueueJson()` (queued
 * replies always win) or override a kind's plan/output with `setScenario()`.
 */
import type { AgentKind } from "@/lib/domain/agent";
import type {
  LLMCompletion,
  LLMCompletionRequest,
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMToolUseBlock,
  LLMUsage,
} from "./types";
import { DEFAULT_MODEL, estimateCostUsd } from "./types";
import { createPrng, type Prng } from "./prng";
import { estimateTokens, extractJsonBlock, fenceJson, isRecord, messageText, parseObject } from "./json";
import { isAgentKind, parseAgentKindMarker } from "./prompts";
import { DEFAULT_SCENARIOS, type MockScenario, type MockTurnContext, type RecordedToolCall } from "./mock-scenarios";

export interface MockLLMProviderOptions {
  /** Seed for the latency PRNG; same seed ⇒ identical latency sequence. */
  seed?: number;
  /** Simulated latency range in ms (never actually slept). */
  latencyMs?: [number, number];
  /** Kind assumed when neither metadata nor the system prompt identify one. */
  fallbackKind?: AgentKind;
}

/** A queued completion: content is required, everything else is filled in. */
export type QueuedCompletion = Partial<Omit<LLMCompletion, "content">> & { content: LLMContentBlock[] };

interface ConversationState {
  objective: string;
  input: Record<string, unknown>;
  calls: RecordedToolCall[];
}

const THOUGHTS: Record<string, string> = {
  get_market_overview: "Establishing the market backdrop before looking at individual names.",
  get_quotes: "Pulling live quotes for the candidate instruments.",
  get_bars: "Checking recent price history to confirm the setup.",
  search_instruments: "Resolving instruments in the universe.",
  get_portfolio_snapshot: "Reviewing current exposure so I do not duplicate risk.",
  list_positions: "Listing open positions to size the book correctly.",
  get_risk_report: "Reading the risk report to understand headroom under every limit.",
  list_open_orders: "Checking working orders to avoid stacking exposure.",
  list_recent_signals: "Collecting the candidate signals awaiting a decision.",
  get_strategy: "Loading the strategy thesis, parameters and universe.",
  propose_signal: "The setup meets the entry criteria; persisting the signal with a defined stop.",
  submit_order: "Executing the approved decision within mandate.",
  cancel_order: "Cancelling the stale order.",
  request_hedge: "Limits are under pressure; proposing a hedge to bring exposure back inside mandate.",
  flag_compliance_issue: "This warrants a formal compliance finding.",
  summarize_run: "Wrapping up with a structured summary.",
};

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private readonly queue: QueuedCompletion[] = [];
  private readonly jsonQueue: unknown[] = [];
  private readonly scenarios: Record<AgentKind, MockScenario> = { ...DEFAULT_SCENARIOS };
  private readonly prng: Prng;
  private readonly latency: [number, number];
  private readonly fallbackKind: AgentKind;
  private counter = 0;
  /** Every request seen, for assertions in tests. */
  readonly requests: LLMCompletionRequest[] = [];

  constructor(opts: MockLLMProviderOptions = {}) {
    this.prng = createPrng(opts.seed ?? 42);
    this.latency = opts.latencyMs ?? [120, 900];
    this.fallbackKind = opts.fallbackKind ?? "market_intelligence";
  }

  /** Queue a completion that will be returned by the next `complete()` call, ahead of scenario logic. */
  enqueue(completion: QueuedCompletion): this {
    this.queue.push(completion);
    return this;
  }

  /** Queue a value for the next `completeJson()` call. */
  enqueueJson(value: unknown): this {
    this.jsonQueue.push(value);
    return this;
  }

  /** Override (partially) the scenario for an agent kind. */
  setScenario(kind: AgentKind, scenario: Partial<MockScenario>): this {
    this.scenarios[kind] = { ...this.scenarios[kind], ...scenario };
    return this;
  }

  /** Drop queued replies, recorded requests and scenario overrides. */
  reset(): void {
    this.queue.length = 0;
    this.jsonQueue.length = 0;
    this.requests.length = 0;
    this.counter = 0;
    for (const k of Object.keys(DEFAULT_SCENARIOS) as AgentKind[]) this.scenarios[k] = DEFAULT_SCENARIOS[k];
  }

  get pendingQueueSize(): number {
    return this.queue.length;
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletion> {
    this.requests.push(req);
    const queued = this.queue.shift();
    if (queued) return this.finish(req, queued.content, queued.stopReason ?? "end_turn", queued);

    const kind = this.resolveKind(req);
    const state = readConversation(req.messages);
    const offered = new Set((req.tools ?? []).map((t) => t.name));
    const ctx: MockTurnContext = { kind, input: state.input, objective: state.objective, calls: state.calls, offered, prng: this.prng };
    const scenario = this.scenarios[kind];

    const next = nextPlannedCall(scenario, ctx);
    if (next) {
      const toolUse: LLMToolUseBlock = {
        type: "tool_use",
        id: `toolu_${req.metadata?.runId ?? "mock"}_${state.calls.length + 1}`,
        name: next.name,
        input: next.input,
      };
      const thought = THOUGHTS[next.name] ?? `Calling ${next.name}.`;
      return this.finish(req, [{ type: "text", text: thought }, toolUse], "tool_use");
    }

    const output = scenario.output(ctx);
    const narrative = typeof output.summary === "string" ? output.summary : `Run complete for ${kind}.`;
    return this.finish(req, [{ type: "text", text: `${narrative}\n\n${fenceJson(output)}` }], "end_turn");
  }

  async completeJson<T>(req: Omit<LLMCompletionRequest, "tools"> & { schemaName: string }): Promise<{ value: T; usage: LLMUsage }> {
    this.requests.push(req);
    const queued = this.jsonQueue.length ? this.jsonQueue.shift() : cannedJson(req.schemaName, req);
    const text = JSON.stringify(queued);
    return { value: queued as T, usage: this.usage(req, text) };
  }

  private resolveKind(req: LLMCompletionRequest): AgentKind {
    const meta = req.metadata?.agentKind;
    if (meta && isAgentKind(meta)) return meta;
    return parseAgentKindMarker(req.system) ?? this.fallbackKind;
  }

  private finish(
    req: LLMCompletionRequest,
    content: LLMContentBlock[],
    stopReason: LLMCompletion["stopReason"],
    overrides: Partial<LLMCompletion> = {},
  ): LLMCompletion {
    this.counter += 1;
    const model = overrides.model ?? req.model ?? DEFAULT_MODEL;
    return {
      id: overrides.id ?? `cmpl_mock_${String(this.counter).padStart(4, "0")}`,
      model,
      content,
      stopReason,
      usage: overrides.usage ?? this.usage({ ...req, model }, JSON.stringify(content)),
    };
  }

  private usage(req: Omit<LLMCompletionRequest, "tools"> & { tools?: LLMCompletionRequest["tools"] }, outputText: string): LLMUsage {
    const inputText = req.system + req.messages.map((m) => JSON.stringify(m.content)).join("") + JSON.stringify(req.tools ?? []);
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    return {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(req.model, inputTokens, outputTokens),
      latencyMs: this.prng.int(this.latency[0], this.latency[1]),
    };
  }
}

/** Pick the first planned call that is offered and still has un-issued invocations. */
function nextPlannedCall(scenario: MockScenario, ctx: MockTurnContext): { name: string; input: Record<string, unknown> } | null {
  const issued = new Map<string, number>();
  for (const c of ctx.calls) issued.set(c.name, (issued.get(c.name) ?? 0) + 1);
  const consumed = new Map<string, number>();
  for (const planned of scenario.plan) {
    if (!ctx.offered.has(planned.name)) continue;
    const inputs = planned.inputs(ctx);
    // Entries earlier in the plan with the same tool name own the first `start` invocations.
    const start = consumed.get(planned.name) ?? 0;
    consumed.set(planned.name, start + inputs.length);
    const used = issued.get(planned.name) ?? 0;
    const idx = Math.max(0, used - start);
    if (idx < inputs.length) return { name: planned.name, input: inputs[idx] };
  }
  return null;
}

/** Reconstruct objective, input context and tool call history from the transcript. */
function readConversation(messages: LLMMessage[]): ConversationState {
  const state: ConversationState = { objective: "", input: {}, calls: [] };
  const first = messages.find((m) => m.role === "user");
  if (first) {
    const text = messageText(first);
    state.objective = /Objective:\s*(.*)/.exec(text)?.[1]?.trim() ?? text.slice(0, 200);
    state.input = extractJsonBlock(text) ?? {};
  }
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type === "tool_use") {
        state.calls.push({ id: block.id, name: block.name, input: block.input, result: undefined, isError: false });
      } else if (block.type === "tool_result") {
        const call = state.calls.find((c) => c.id === block.toolUseId);
        if (!call) continue;
        const parsed = parseObject(block.content);
        call.result = parsed ?? block.content;
        call.isError = block.isError ?? false;
      }
    }
  }
  return state;
}

function cannedJson(schemaName: string, req: Omit<LLMCompletionRequest, "tools">): unknown {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const subject = lastUser ? messageText(lastUser).slice(0, 120) : "";
  switch (schemaName) {
    case "run_summary":
      return { summary: `Mock summary: ${subject || "run completed"}`.trim(), highlights: [], confidence: 0.7 };
    case "classification":
      return { label: "neutral", confidence: 0.5 };
    case "sentiment":
      return { sentiment: "neutral", score: 0 };
    default: {
      const fromPrompt = extractJsonBlock(req.system);
      return isRecord(fromPrompt) ? fromPrompt : { schemaName, note: "mock structured output" };
    }
  }
}
