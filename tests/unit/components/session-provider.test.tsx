// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SessionProvider, useCan, useCanAll, useOptionalSession, useSession } from "@/components/providers/session-provider";
import { principalFromUser } from "@/lib/auth/permissions";
import type { Permission, RoleKey } from "@/lib/domain/auth";
import { makeUser } from "@/tests/fixtures/entities";

afterEach(cleanup);

function sessionFor(...roles: RoleKey[]) {
  const user = makeUser({ roles, name: "Ada Lovelace", email: "ada@agenticprop.com" });
  return { user, principal: principalFromUser(user) };
}

function Can({ permission }: { permission: Permission }) {
  return <span data-testid="can">{String(useCan(permission))}</span>;
}

function Who() {
  const { user, principal } = useSession();
  return (
    <span data-testid="who">
      {user.name}:{principal.roles.join(",")}
    </span>
  );
}

describe("<SessionProvider />", () => {
  it("exposes the session to descendants", () => {
    render(
      <SessionProvider value={sessionFor("trader")}>
        <Who />
      </SessionProvider>,
    );
    expect(screen.getByTestId("who").textContent).toBe("Ada Lovelace:trader");
  });

  it("throws when useSession is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Who />)).toThrow(/useSession must be used within/);
    spy.mockRestore();
  });

  it("returns null from useOptionalSession outside the provider", () => {
    function Optional() {
      return <span data-testid="optional">{String(useOptionalSession() === null)}</span>;
    }
    render(<Optional />);
    expect(screen.getByTestId("optional").textContent).toBe("true");
  });
});

describe("useCan", () => {
  it("is true for a permission the role grants", () => {
    render(
      <SessionProvider value={sessionFor("trader")}>
        <Can permission="orders:create" />
      </SessionProvider>,
    );
    expect(screen.getByTestId("can").textContent).toBe("true");
  });

  it("is false for a permission the role lacks", () => {
    render(
      <SessionProvider value={sessionFor("trader")}>
        <Can permission="risk:limits:write" />
      </SessionProvider>,
    );
    expect(screen.getByTestId("can").textContent).toBe("false");
  });

  it("is false with no provider rather than throwing", () => {
    render(<Can permission="orders:create" />);
    expect(screen.getByTestId("can").textContent).toBe("false");
  });

  it("unions permissions across roles and requires all of them for useCanAll", () => {
    function All() {
      return <span data-testid="all">{String(useCanAll(["orders:create", "risk:limits:write"]))}</span>;
    }
    const { rerender } = render(
      <SessionProvider value={sessionFor("trader")}>
        <All />
      </SessionProvider>,
    );
    expect(screen.getByTestId("all").textContent).toBe("false");

    rerender(
      <SessionProvider value={sessionFor("trader", "risk_manager")}>
        <All />
      </SessionProvider>,
    );
    expect(screen.getByTestId("all").textContent).toBe("true");
  });
});
