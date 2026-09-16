// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Badge, StatusBadge, StatusDot, TONE_BADGE } from "@/components/ui/badge";
import type { Tone } from "@/lib/ui/status";

afterEach(cleanup);

const TONES: Tone[] = ["neutral", "muted", "accent", "positive", "negative", "warning", "info"];

describe("<Badge />", () => {
  it("exposes the tone and applies its class set", () => {
    for (const tone of TONES) {
      cleanup();
      render(<Badge tone={tone}>Label</Badge>);
      const badge = screen.getByText("Label");
      expect(badge.dataset.tone).toBe(tone);
      for (const className of TONE_BADGE[tone].split(" ")) expect(badge.className).toContain(className);
    }
  });

  it("renders a dot only when asked", () => {
    const { container, rerender } = render(<Badge tone="positive">Live</Badge>);
    expect(container.querySelectorAll("span span")).toHaveLength(0);
    rerender(
      <Badge tone="positive" dot>
        Live
      </Badge>,
    );
    expect(container.querySelectorAll("span span")).toHaveLength(1);
  });

  it("switches size classes", () => {
    render(
      <Badge size="xs" tone="info">
        Small
      </Badge>,
    );
    expect(screen.getByText("Small").className).toContain("h-4");
  });
});

describe("<StatusBadge />", () => {
  it("colours by the status map and humanises non-code values", () => {
    render(<StatusBadge kind="agentRun" value="budget_exhausted" />);
    const badge = screen.getByTitle("budget_exhausted");
    expect(badge.dataset.tone).toBe("warning");
    expect(badge.textContent).toContain("Budget exhausted");
  });

  it("keeps order/side/direction codes verbatim", () => {
    render(<StatusBadge kind="order" value="PARTIALLY_FILLED" />);
    expect(screen.getByTitle("PARTIALLY_FILLED").textContent).toContain("PARTIALLY_FILLED");
  });

  it("degrades to an em dash when the value is missing", () => {
    render(<StatusBadge kind="order" value={null} />);
    expect(screen.getByText("—").dataset.tone).toBe("muted");
  });
});

describe("<StatusDot />", () => {
  it("labels the dot for screen readers", () => {
    render(<StatusDot tone="negative" label="IBKR disconnected" />);
    expect(screen.getByText("IBKR disconnected").className).toContain("sr-only");
  });
});
