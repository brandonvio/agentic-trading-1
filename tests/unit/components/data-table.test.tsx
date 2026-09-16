// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// The app router context is not available in jsdom; render Link as a plain anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { DataTable } = await import("@/components/ui/data-table");
type Column<Row> = Parameters<typeof DataTable<Row>>[0]["columns"][number];

interface Row {
  id: string;
  code: string;
  nav: number;
}

const rows: Row[] = [
  { id: "p1", code: "MACRO-1", nav: 1200 },
  { id: "p2", code: "FX-1", nav: 800 },
];

const columns: Column<Row>[] = [
  { key: "code", header: "Code" },
  { key: "nav", header: "NAV", align: "right", render: (row) => row.nav.toFixed(2) },
];

afterEach(cleanup);

describe("<DataTable />", () => {
  it("renders one row per record with rendered cells", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Portfolios" />);
    const body = screen.getAllByRole("rowgroup")[1]!;
    const bodyRows = within(body).getAllByRole("row");
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[0]!).getByText("MACRO-1")).toBeDefined();
    expect(within(bodyRows[0]!).getByText("1200.00")).toBeDefined();
    expect(screen.getByText("Portfolios").tagName).toBe("CAPTION");
  });

  it("right-aligns and mono-formats numeric columns by default", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const cell = screen.getByText("800.00");
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("num");
  });

  it("turns the first cell into a row link when rowHref is given", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} rowHref={(row) => `/portfolios/${row.id}`} />);
    expect(screen.getByRole("link", { name: "MACRO-1" }).getAttribute("href")).toBe("/portfolios/p1");
  });

  it("renders an empty state instead of a table when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyTitle="No portfolios"
        emptyDescription="Nothing is visible to your role."
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No portfolios")).toBeDefined();
    expect(screen.getByText("Nothing is visible to your role.")).toBeDefined();
  });

  it("renders the footer slot when provided", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} footer="Showing 2 of 40" />);
    expect(screen.getByText("Showing 2 of 40")).toBeDefined();
  });
});
