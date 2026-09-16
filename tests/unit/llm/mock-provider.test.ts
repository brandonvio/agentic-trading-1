/** MockLLMProvider: determinism, queue overrides, tool sequencing, JSON output. */
import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "@/lib/llm/mock-provider";
import { buildSystemPrompt, buildUserMessage } from "@/lib/llm/prompts";
import { extractJsonBlock, fenceJson } from "@/lib/llm/json";
import { estimateCostUsd, type LLMCompletionRequest, type LLMContentBlock, type LLMMessage, type LLMToolDefinition } from "@/lib/llm/types";
import { createToolRegistry } from "@/lib/agents/tools";
import { AGENT_BLUEPRINTS } from "@/lib/agents/definitions";
import { makeAgent } from "@/tests/fixtures/entities";
import type { AgentKind } from "@/lib/domain/agent";

const registry = createToolRegistry();

function agentOf(kind: AgentKind) {
  const bp = AGENT_BLUEPRINTS[kind];
  return makeAgent({
    id: `agt_${kind}`,
    kind,
    name: bp.name,
    description: bp.description,
    autonomy: bp.defaultAutonomy,
    model: bp.defaultModel,
    tools: bp.defaultTools,
    guardrails: bp.guardrails,
    maxStepsPerRun: bp.defaultMaxSteps,
    strategyIds: ["strat_1"],
  });
}

function requestFor(kind: AgentKind, input: Record<string, unknown>): LLMCompletionRequest {
  const agent = agentOf(kind);
  return {
    model: agent.model,
    system: buildSystemPrompt(agent),
    messages: [{ role: "user", content: buildUserMessage("Do the thing", input) }],
    tools: registry.definitionsFor(agent.tools) as LLMToolDefinition[],
    metadata: { runId: "run_1", agentId: agent.id, agentKind: kind },
  };
}

/** Drive the mock like the runtime does, answering every tool call with `answer`. */
async function driveToCompletion(
  provider: MockLLMProvider,
  req: LLMCompletionRequest,
  answer: (name: string, input: Record<string, unknown>) => Record<string, unknown>,
  maxTurns = 12,
) {
  const messages: LLMMessage[] = [...req.messages];
  const called: string[] = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    const completion = await provider.complete({ ...req, messages });
    messages.push({ role: "assistant", content: completion.content });
    const uses = completion.content.filter((b): b is Extract<LLMContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (uses.length === 0 || completion.stopReason === "end_turn") {
      const text = completion.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      return { called, text, completion, turns: turn + 1 };
    }
    const results: LLMContentBlock[] = uses.map((u) => {
      called.push(u.name);
      return { type: "tool_result", toolUseId: u.id, content: JSON.stringify(answer(u.name, u.input)) };
    });
    messages.push({ role: "user", content: results });
  }
  throw new Error("mock provider did not terminate");
}

const ANSWERS: Record<string, Record<string, unknown>> = {
  get_market_overview: {
    regime: "risk_on",
    headline: "Tape grinds higher",
    movers: [
      { instrumentId: "ins_aapl", symbol: "AAPL", changePct: 0.012 },
      { instrumentId: "ins_btc", symbol: "BTC-USD", changePct: -0.02 },
    ],
    eventCalendar: [{ time: "2026-09-01T12:30:00.000Z", event: "US CPI", importance: "high" }],
  },
  get_quotes: {
    quotes: [
      { instrumentId: "ins_aapl", symbol: "AAPL", last: 200, changePct: 0.012, volume: 1_000_000 },
      { instrumentId: "ins_btc", symbol: "BTC-USD", last: 60_000, changePct: -0.02, volume: 500 },
    ],
  },
  get_bars: { instrumentId: "ins_aapl", bars: [] },
  get_portfolio_snapshot: { nav: 50_000_000, cash: 20_000_000 },
  get_strategy: { code: "MOM-1", parameters: { lookback: 20 }, instrumentIds: ["ins_aapl", "ins_btc"] },
  propose_signal: { signalId: "sig_1", symbol: "AAPL", direction: "LONG", conviction: 0.7, suggestedNotional: 500_000 },
};

function answerFor(name: string): Record<string, unknown> {
  return ANSWERS[name] ?? { ok: true };
}

describe("MockLLMProvider", () => {
  it("is deterministic: the same seed and request produce identical completions", async () => {
    const a = new MockLLMProvider({ seed: 11 });
    const b = new MockLLMProvider({ seed: 11 });
    const req = requestFor("market_intelligence", { portfolioId: "pf_main", instrumentIds: ["ins_aapl"] });
    const first = await a.complete(req);
    const second = await b.complete(req);
    expect(second).toEqual(first);
  });

  it("varies latency with the seed but keeps content stable", async () => {
    const a = new MockLLMProvider({ seed: 1 });
    const b = new MockLLMProvider({ seed: 2 });
    const req = requestFor("market_intelligence", {});
    const first = await a.complete(req);
    const second = await b.complete(req);
    expect(second.content).toEqual(first.content);
    expect(second.usage.latencyMs).not.toBe(first.usage.latencyMs);
  });

  it("prices usage from the model's tariff", async () => {
    const provider = new MockLLMProvider({ seed: 3 });
    const completion = await provider.complete({ ...requestFor("market_intelligence", {}), model: "claude-haiku-4-5-20251001" });
    expect(completion.usage.costUsd).toBeCloseTo(
      estimateCostUsd("claude-haiku-4-5-20251001", completion.usage.inputTokens, completion.usage.outputTokens),
      12,
    );
  });

  it("returns queued completions ahead of scenario logic, in order", async () => {
    const provider = new MockLLMProvider({ seed: 5 });
    provider.enqueue({ content: [{ type: "text", text: "first" }] });
    provider.enqueue({ content: [{ type: "text", text: "second" }], stopReason: "max_tokens" });
    const req = requestFor("signal_generation", { portfolioId: "pf_main" });
    expect((await provider.complete(req)).content).toEqual([{ type: "text", text: "first" }]);
    const second = await provider.complete(req);
    expect(second.stopReason).toBe("max_tokens");
    expect(provider.pendingQueueSize).toBe(0);
    // Back to scenario behaviour once the queue drains.
    expect((await provider.complete(req)).content.some((b) => b.type === "tool_use")).toBe(true);
  });

  it("recognises the agent kind from the system prompt marker when metadata is absent", async () => {
    const provider = new MockLLMProvider({ seed: 5, fallbackKind: "compliance" });
    const req = requestFor("signal_generation", { portfolioId: "pf_main", strategyId: "strat_1" });
    const completion = await provider.complete({ ...req, metadata: undefined });
    const use = completion.content.find((b) => b.type === "tool_use");
    expect(use && use.type === "tool_use" ? use.name : null).toBe("get_strategy");
  });

  it("walks the signal_generation plan one tool per turn and ends with a JSON block", async () => {
    const provider = new MockLLMProvider({ seed: 9 });
    const req = requestFor("signal_generation", { portfolioId: "pf_main", strategyId: "strat_1" });
    const { called, text, completion } = await driveToCompletion(provider, req, (name) => answerFor(name));

    expect(called.slice(0, 5)).toEqual(["get_strategy", "get_market_overview", "get_quotes", "get_bars", "get_portfolio_snapshot"]);
    expect(called.filter((n) => n === "propose_signal")).toHaveLength(2);
    expect(completion.stopReason).toBe("end_turn");

    const output = extractJsonBlock(text);
    expect(output).not.toBeNull();
    expect(Array.isArray(output?.signals)).toBe(true);
    expect(output?.signals).toHaveLength(2);
    expect(typeof output?.summary).toBe("string");
  });

  it("only plans tools that are actually offered", async () => {
    const provider = new MockLLMProvider({ seed: 9 });
    const req = requestFor("signal_generation", { portfolioId: "pf_main", strategyId: "strat_1" });
    const narrowed = { ...req, tools: registry.definitionsFor(["get_market_overview", "get_quotes"]) };
    const { called } = await driveToCompletion(provider, narrowed, (name) => answerFor(name));
    expect(called).toEqual(["get_market_overview", "get_quotes"]);
  });

  it("produces the risk_sentinel hedge plan only when a limit is breached", async () => {
    const clean = await driveToCompletion(new MockLLMProvider({ seed: 4 }), requestFor("risk_sentinel", { portfolioId: "pf_main" }), (name) =>
      name === "get_risk_report" ? { limits: [{ limit: { metric: "gross_exposure_pct_nav", threshold: 3 }, observed: 1, status: "ok" }] } : answerFor(name),
    );
    expect(clean.called).not.toContain("request_hedge");
    expect(extractJsonBlock(clean.text)?.severity).toBe("none");

    const breached = await driveToCompletion(new MockLLMProvider({ seed: 4 }), requestFor("risk_sentinel", { portfolioId: "pf_main" }), (name) => {
      if (name === "get_risk_report") return { limits: [{ limit: { metric: "gross_exposure_pct_nav", threshold: 3 }, observed: 3.4, status: "breached" }] };
      if (name === "list_positions") return { positions: [{ instrumentId: "ins_aapl", symbol: "AAPL", marketValue: 4_000_000 }] };
      if (name === "request_hedge") return { signalId: "sig_h1", symbol: "AAPL", thesis: "halve the position" };
      return answerFor(name);
    });
    expect(breached.called).toContain("request_hedge");
    const output = extractJsonBlock(breached.text);
    expect(output?.severity).toBe("critical");
    expect(output?.hedgeProposals).toEqual([{ signalId: "sig_h1", symbol: "AAPL", rationale: "halve the position" }]);
  });

  it("records every request it has seen", async () => {
    const provider = new MockLLMProvider({ seed: 2 });
    const req = requestFor("compliance", { portfolioId: "pf_main" });
    await provider.complete(req);
    await provider.complete(req);
    expect(provider.requests).toHaveLength(2);
    provider.reset();
    expect(provider.requests).toHaveLength(0);
  });

  describe("completeJson", () => {
    it("returns queued values first", async () => {
      const provider = new MockLLMProvider({ seed: 1 });
      provider.enqueueJson({ label: "bullish", confidence: 0.9 });
      const { value, usage } = await provider.completeJson<{ label: string }>({
        model: "claude-sonnet-5",
        system: "classify",
        messages: [{ role: "user", content: "AAPL beat earnings" }],
        schemaName: "classification",
      });
      expect(value.label).toBe("bullish");
      expect(usage.inputTokens).toBeGreaterThan(0);
    });

    it("falls back to canned output per schema name", async () => {
      const provider = new MockLLMProvider({ seed: 1 });
      const { value } = await provider.completeJson<{ sentiment: string }>({
        model: "claude-sonnet-5",
        system: "score it",
        messages: [{ role: "user", content: "flat tape" }],
        schemaName: "sentiment",
      });
      expect(value.sentiment).toBe("neutral");
    });

    it("echoes a JSON block found in the system prompt for unknown schemas", async () => {
      const provider = new MockLLMProvider({ seed: 1 });
      const { value } = await provider.completeJson<{ shape: string }>({
        model: "claude-sonnet-5",
        system: `Return this shape:\n${fenceJson({ shape: "custom" })}`,
        messages: [{ role: "user", content: "go" }],
        schemaName: "anything_else",
      });
      expect(value.shape).toBe("custom");
    });
  });
});
