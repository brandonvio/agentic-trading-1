// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { StatTile } = await import("@/components/ui/stat-tile");

afterEach(cleanup);

describe("<StatTile />", () => {
  it("renders the label and pre-formatted value", () => {
    render(<StatTile label="Total NAV" value="$1.24B" />);
    expect(screen.getByText("Total NAV")).toBeDefined();
    expect(screen.getByTestId("stat-value").textContent).toBe("$1.24B");
  });

  it("colours a positive delta green and marks it with an up arrow", () => {
    render(<StatTile label="Day P&L" value="+$1.2M" delta={0.0124} deltaLabel="of NAV" />);
    const delta = screen.getByTestId("stat-delta");
    expect(delta.dataset.sign).toBe("pos");
    expect(delta.className).toContain("text-positive");
    expect(delta.textContent).toContain("▲");
    expect(delta.textContent).toContain("+1.24%");
    expect(delta.textContent).toContain("of NAV");
  });

  it("colours a negative delta red", () => {
    render(<StatTile label="Day P&L" value="-$400K" delta={-0.031} />);
    const delta = screen.getByTestId("stat-delta");
    expect(delta.dataset.sign).toBe("neg");
    expect(delta.className).toContain("text-negative");
    expect(delta.textContent).toContain("▼");
  });

  it("treats a zero delta as muted", () => {
    render(<StatTile label="Day P&L" value="$0" delta={0} />);
    const delta = screen.getByTestId("stat-delta");
    expect(delta.dataset.sign).toBe("zero");
    expect(delta.className).toContain("text-fg-subtle");
  });

  it("tones the value itself when asked", () => {
    render(<StatTile label="Unrealized" value="-$2M" valueTone="negative" />);
    expect(screen.getByTestId("stat-value").className).toContain("text-negative");
  });

  it("shows a hint when there is no delta, and links when href is set", () => {
    render(<StatTile label="Approvals" value="3" hint="Awaiting a decision" href="/approvals" />);
    expect(screen.queryByTestId("stat-delta")).toBeNull();
    expect(screen.getByText("Awaiting a decision")).toBeDefined();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/approvals");
  });

  it("uses a custom delta formatter when supplied", () => {
    render(<StatTile label="Cost" value="$4.10" delta={12} deltaFormat={(d) => `${d} runs`} />);
    expect(screen.getByTestId("stat-delta").textContent).toContain("12 runs");
  });
});
