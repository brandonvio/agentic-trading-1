// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/lib/domain/order";
import { AgentRunStatus, SignalStatus } from "@/lib/domain/agent";
import { RiskBreachSeverity } from "@/lib/domain/risk";
import { PortfolioStatus } from "@/lib/domain/portfolio";
import {
  AGENT_RUN_STATUS_TONE,
  ORDER_STATUS_TONE,
  PORTFOLIO_STATUS_TONE,
  RISK_SEVERITY_TONE,
  SIGNAL_STATUS_TONE,
  toneFor,
  toneForSign,
  toneForUtilization,
} from "@/lib/ui/status";

describe("status tone maps", () => {
  it("covers every enum member", () => {
    for (const value of OrderStatus.options) expect(ORDER_STATUS_TONE[value]).toBeDefined();
    for (const value of AgentRunStatus.options) expect(AGENT_RUN_STATUS_TONE[value]).toBeDefined();
    for (const value of RiskBreachSeverity.options) expect(RISK_SEVERITY_TONE[value]).toBeDefined();
    for (const value of PortfolioStatus.options) expect(PORTFOLIO_STATUS_TONE[value]).toBeDefined();
    for (const value of SignalStatus.options) expect(SIGNAL_STATUS_TONE[value]).toBeDefined();
  });

  it("maps terminal and failure states to the expected tones", () => {
    expect(toneFor("order", "FILLED")).toBe("positive");
    expect(toneFor("order", "RISK_REJECTED")).toBe("negative");
    expect(toneFor("order", "PENDING_APPROVAL")).toBe("warning");
    expect(toneFor("agentRun", "running")).toBe("accent");
    expect(toneFor("riskSeverity", "critical")).toBe("negative");
  });

  it("falls back safely for unknown or missing values", () => {
    expect(toneFor("order", "NOT_A_STATUS")).toBe("neutral");
    expect(toneFor("order", null)).toBe("muted");
  });
});

describe("numeric tones", () => {
  it("colours by sign", () => {
    expect(toneForSign(1)).toBe("positive");
    expect(toneForSign(-1)).toBe("negative");
    expect(toneForSign(0)).toBe("neutral");
    expect(toneForSign(null)).toBe("neutral");
  });

  it("colours utilisation against warn and breach thresholds", () => {
    expect(toneForUtilization(0.4)).toBe("positive");
    expect(toneForUtilization(0.85)).toBe("warning");
    expect(toneForUtilization(1.2)).toBe("negative");
    expect(toneForUtilization(0.6, 0.5, 0.9)).toBe("warning");
  });
});
