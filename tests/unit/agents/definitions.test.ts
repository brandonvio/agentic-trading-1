/** Agent blueprints and the DI registration of the agent layer. */
import { describe, expect, it } from "vitest";
import { Container } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";
import { FixedClock } from "@/lib/core/clock";
import { SequentialIdGenerator } from "@/lib/core/ids";
import { NoopLogger } from "@/lib/core/logger";
import { AgentKind } from "@/lib/domain/agent";
import { createInMemoryRepositories } from "@/lib/repositories/memory";
import { registerLLM } from "@/lib/llm";
import { AGENT_BLUEPRINTS, AGENT_KINDS, blueprintFor, defaultObjectiveFor } from "@/lib/agents/definitions";
import { ALL_TOOL_NAMES, createToolRegistry } from "@/lib/agents/tools";
import { AgentServiceImpl } from "@/lib/agents/agent.service";
import { SignalServiceImpl } from "@/lib/agents/signal.service";
import { agentStackOf, registerAgentServices } from "@/lib/agents";
import { T0 } from "@/tests/fixtures/entities";

const KINDS = AgentKind.options;

describe("AGENT_BLUEPRINTS", () => {
  it("covers every agent kind exactly once", () => {
    expect(Object.keys(AGENT_BLUEPRINTS).sort()).toEqual([...KINDS].sort());
    expect([...AGENT_KINDS].sort()).toEqual([...KINDS].sort());
  });

  it("only grants tools that exist in the catalogue", () => {
    for (const kind of KINDS) {
      for (const tool of AGENT_BLUEPRINTS[kind].defaultTools) {
        expect(ALL_TOOL_NAMES, `${kind} grants ${tool}`).toContain(tool);
      }
      expect(AGENT_BLUEPRINTS[kind].defaultTools).toContain("summarize_run");
    }
  });

  it("assigns the intended model tier per kind", () => {
    expect(AGENT_BLUEPRINTS.portfolio_manager.defaultModel).toBe("claude-fable-5-1");
    expect(AGENT_BLUEPRINTS.risk_sentinel.defaultModel).toBe("claude-fable-5-1");
    expect(AGENT_BLUEPRINTS.strategy_research.defaultModel).toBe("claude-fable-5-1");
    expect(AGENT_BLUEPRINTS.signal_generation.defaultModel).toBe("claude-sonnet-5");
    expect(AGENT_BLUEPRINTS.execution.defaultModel).toBe("claude-sonnet-5");
    expect(AGENT_BLUEPRINTS.market_intelligence.defaultModel).toBe("claude-sonnet-5");
    expect(AGENT_BLUEPRINTS.compliance.defaultModel).toBe("claude-haiku-4-5-20251001");
  });

  it("gives non-trading kinds no notional budget and no order tools", () => {
    for (const kind of ["market_intelligence", "strategy_research", "signal_generation", "compliance"] as const) {
      const bp = AGENT_BLUEPRINTS[kind];
      expect(bp.defaultMaxNotionalPerRun).toBe(0);
      expect(bp.defaultAutonomy).toBe("advisory");
      expect(bp.defaultTools).not.toContain("submit_order");
      expect(bp.defaultTools).not.toContain("cancel_order");
    }
    for (const kind of ["execution", "risk_sentinel", "portfolio_manager"] as const) {
      expect(AGENT_BLUEPRINTS[kind].defaultAutonomy).toBe("supervised");
      expect(AGENT_BLUEPRINTS[kind].defaultMaxNotionalPerRun).toBeGreaterThan(0);
    }
  });

  it("carries substantive guardrails, a schedule, a step budget and an objective", () => {
    for (const kind of KINDS) {
      const bp = blueprintFor(kind);
      expect(bp.guardrails.length).toBeGreaterThanOrEqual(5);
      expect(bp.guardrails.every((g) => g.length > 30)).toBe(true);
      expect(bp.defaultSchedule.description.length).toBeGreaterThan(5);
      expect(bp.defaultMaxSteps).toBeGreaterThan(5);
      expect(defaultObjectiveFor(kind).length).toBeGreaterThan(20);
    }
  });
});

describe("registerAgentServices", () => {
  function baseContainer(): Container {
    const c = new Container();
    const repos = createInMemoryRepositories();
    c.registerValue(TOKENS.clock, new FixedClock(T0));
    c.registerValue(TOKENS.ids, new SequentialIdGenerator("di"));
    c.registerValue(TOKENS.logger, new NoopLogger());
    c.registerValue(TOKENS.repos, repos);
    registerLLM(c, "mock");
    return c;
  }

  it("binds both tokens without resolving peer services at registration time", () => {
    const c = baseContainer();
    // No market/order/risk/... services are registered at all.
    registerAgentServices(c);
    expect(c.resolve(TOKENS.agentService)).toBeInstanceOf(AgentServiceImpl);
    expect(c.resolve(TOKENS.signalService)).toBeInstanceOf(SignalServiceImpl);
  });

  it("shares one registry, kill switch and runtime per container", () => {
    const c = baseContainer();
    registerAgentServices(c);
    const stack = agentStackOf(c);
    expect(agentStackOf(c)).toBe(stack);
    expect(c.resolve(TOKENS.agentService)).toBe(stack.agents);
    expect(stack.registry.names()).toEqual([...ALL_TOOL_NAMES]);
    expect(stack.killSwitch.size).toBe(0);
  });

  it("builds an independent stack per container", () => {
    const a = baseContainer();
    const b = baseContainer();
    registerAgentServices(a);
    registerAgentServices(b);
    expect(agentStackOf(a).killSwitch).not.toBe(agentStackOf(b).killSwitch);
  });
});

describe("createToolRegistry", () => {
  it("registers the whole catalogue", () => {
    const registry = createToolRegistry();
    expect(registry.names()).toEqual([...ALL_TOOL_NAMES]);
    expect(registry.has("summarize_run")).toBe(true);
    expect(registry.get("submit_order")?.kinds).toEqual(["execution", "portfolio_manager", "risk_sentinel"]);
    expect(registry.get("submit_order")?.allowAdvisory).toBe(false);
  });
});
