/** Prompt assembly, JSON extraction and the seeded PRNG. */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserMessage, outputContractFor, parseAgentKindMarker, isAgentKind } from "@/lib/llm/prompts";
import { estimateTokens, extractJsonBlock, fenceJson, isRecord, messageText, parseObject } from "@/lib/llm/json";
import { createPrng, hashString } from "@/lib/llm/prng";
import { AGENT_BLUEPRINTS } from "@/lib/agents/definitions";
import { makeAgent, makePortfolio, makeStrategy } from "@/tests/fixtures/entities";

describe("extractJsonBlock", () => {
  it("tolerates prose around a fenced block", () => {
    const text = `Here is my read of the tape.\n\n\`\`\`json\n{"summary":"ok","confidence":0.6}\n\`\`\`\nThanks.`;
    expect(extractJsonBlock(text)).toEqual({ summary: "ok", confidence: 0.6 });
  });

  it("takes the last fenced block when several are present", () => {
    const text = `${fenceJson({ draft: true })}\nrevised:\n${fenceJson({ draft: false })}`;
    expect(extractJsonBlock(text)).toEqual({ draft: false });
  });

  it("falls back to a bare top-level object", () => {
    expect(extractJsonBlock('narrative {"a":1} trailing')).toEqual({ a: 1 });
  });

  it("returns null for text without an object and for non-objects", () => {
    expect(extractJsonBlock("no json at all")).toBeNull();
    expect(extractJsonBlock("```json\n[1,2,3]\n```")).toBeNull();
    expect(parseObject("{ not json")).toBeNull();
  });

  it("recognises plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it("concatenates the text blocks of a message", () => {
    expect(messageText({ role: "assistant", content: [{ type: "text", text: "a" }, { type: "tool_use", id: "1", name: "t", input: {} }, { type: "text", text: "b" }] })).toBe("a\nb");
    expect(messageText({ role: "user", content: "plain" })).toBe("plain");
  });

  it("estimates tokens at roughly four characters each", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(1);
  });
});

describe("buildSystemPrompt", () => {
  const blueprint = AGENT_BLUEPRINTS.portfolio_manager;
  const agent = makeAgent({
    kind: "portfolio_manager",
    name: "GM PM",
    autonomy: "autonomous",
    tools: blueprint.defaultTools,
    guardrails: blueprint.guardrails,
    maxNotionalPerRun: 2_000_000,
  });

  it("includes every section and the agent-kind marker", () => {
    const prompt = buildSystemPrompt(agent);
    for (const heading of ["# Role", "# Mandate", "# Operating context", "# Process", "# Risk discipline", "# Autonomy", "# Tool protocol", "# Output contract", "# Hard guardrails"]) {
      expect(prompt).toContain(heading);
    }
    expect(parseAgentKindMarker(prompt)).toBe("portfolio_manager");
  });

  it("states the autonomy level and the granted tools", () => {
    const prompt = buildSystemPrompt(agent);
    expect(prompt).toContain("AUTONOMOUS");
    expect(prompt).toContain(blueprint.defaultTools.join(", "));
  });

  it("grounds the prompt in the portfolio mandate and strategies when given", () => {
    const portfolio = makePortfolio({ code: "GM-ALPHA", nav: 50_000_000 });
    const strategy = makeStrategy({ code: "MOM-1" });
    const prompt = buildSystemPrompt(agent, { portfolio, strategies: [strategy] });
    expect(prompt).toContain("Portfolio GM-ALPHA");
    expect(prompt).toContain("Strategy MOM-1");
    expect(prompt).toContain("agent trading enabled");
  });

  it("exposes the output contract for the kind", () => {
    expect(Object.keys(outputContractFor("portfolio_manager"))).toContain("decisions");
    expect(isAgentKind("execution")).toBe(true);
    expect(isAgentKind("nope")).toBe(false);
    expect(parseAgentKindMarker("no marker here")).toBeNull();
  });
});

describe("buildUserMessage", () => {
  it("carries the objective and fenced context", () => {
    const msg = buildUserMessage("Size the book", { portfolioId: "pf_main" });
    expect(msg).toContain("Objective: Size the book");
    expect(extractJsonBlock(msg)).toEqual({ portfolioId: "pf_main" });
  });

  it("says so when there is no context", () => {
    expect(buildUserMessage("Look around", {})).toContain("Context: none provided.");
  });
});

describe("createPrng", () => {
  it("is reproducible from a seed", () => {
    const a = createPrng(1234);
    const b = createPrng(1234);
    const seqA = [a.next(), a.int(1, 100), a.float(0, 1)];
    const seqB = [b.next(), b.int(1, 100), b.float(0, 1)];
    expect(seqB).toEqual(seqA);
  });

  it("stays inside the requested bounds", () => {
    const prng = createPrng(hashString("agentic-prop"));
    for (let i = 0; i < 200; i++) {
      const n = prng.int(5, 9);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it("hashes strings deterministically", () => {
    expect(hashString("run_1")).toBe(hashString("run_1"));
    expect(hashString("run_1")).not.toBe(hashString("run_2"));
  });
});
