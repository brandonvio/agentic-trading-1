// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sparkline, sparklinePath } from "@/components/ui/sparkline";

afterEach(cleanup);

describe("sparklinePath", () => {
  it("scales the series into the box, inverting the y axis", () => {
    expect(sparklinePath([0, 1], 10, 10)).toBe("M1.00,9.00 L9.00,1.00");
  });

  it("pins a flat series to the baseline without dividing by zero", () => {
    expect(sparklinePath([5, 5, 5], 10, 10)).toBe("M1.00,9.00 L5.00,9.00 L9.00,9.00");
  });

  it("returns an empty path for an empty series", () => {
    expect(sparklinePath([], 96, 28)).toBe("");
  });
});

describe("<Sparkline />", () => {
  it("draws the stroke path plus an area fill", () => {
    const { container } = render(<Sparkline data={[1, 3, 2, 5]} width={40} height={20} />);
    const stroke = screen.getByTestId("sparkline-path");
    expect(stroke.getAttribute("d")).toContain("M1.00,");
    expect(stroke.getAttribute("stroke")).toBe("var(--positive)");
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("colours a falling series negative and can drop the fill", () => {
    const { container } = render(<Sparkline data={[5, 2]} fill={false} />);
    expect(screen.getByTestId("sparkline-path").getAttribute("stroke")).toBe("var(--negative)");
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("renders no path for an empty series", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("is labelled as an image only when given a title", () => {
    const { container, rerender } = render(<Sparkline data={[1, 2]} title="Day P&L" />);
    expect(screen.getByRole("img", { name: "Day P&L" })).toBeDefined();
    rerender(<Sparkline data={[1, 2]} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws a dashed baseline inside the range", () => {
    const { container } = render(<Sparkline data={[-2, 4]} baseline={0} />);
    expect(container.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("2 2");
  });
});
