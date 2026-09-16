import { describe, it, expect } from "vitest";
import { Container, token } from "@/lib/core/container";
import { TOKENS } from "@/lib/core/tokens";

interface Greeter {
  greet(): string;
}

const GREETER = token<Greeter>("Greeter");
const COUNTER = token<{ n: number }>("Counter");

describe("Container", () => {
  it("resolves registered singletons once", () => {
    const c = new Container();
    let calls = 0;
    c.register(COUNTER, () => ({ n: ++calls }));
    expect(c.resolve(COUNTER)).toBe(c.resolve(COUNTER));
    expect(calls).toBe(1);
  });

  it("creates transient instances when singleton=false", () => {
    const c = new Container();
    let calls = 0;
    c.register(COUNTER, () => ({ n: ++calls }), { singleton: false });
    expect(c.resolve(COUNTER).n).toBe(1);
    expect(c.resolve(COUNTER).n).toBe(2);
  });

  it("injects dependencies through the factory argument", () => {
    const c = new Container();
    c.registerValue(COUNTER, { n: 7 });
    c.register(GREETER, (cc) => ({ greet: () => `n=${cc.resolve(COUNTER).n}` }));
    expect(c.resolve(GREETER).greet()).toBe("n=7");
  });

  it("throws a descriptive error for unknown tokens", () => {
    const c = new Container();
    expect(() => c.resolve(GREETER)).toThrow(/Greeter/);
  });

  it("child containers override parent registrations without mutating the parent", () => {
    const parent = new Container();
    parent.registerValue(COUNTER, { n: 1 });
    const child = parent.createChild();
    child.registerValue(COUNTER, { n: 2 });
    expect(child.resolve(COUNTER).n).toBe(2);
    expect(parent.resolve(COUNTER).n).toBe(1);
    expect(child.has(GREETER)).toBe(false);
    parent.registerValue(GREETER, { greet: () => "hi" });
    expect(child.has(GREETER)).toBe(true);
    expect(child.resolve(GREETER).greet()).toBe("hi");
  });
});

describe("token identity", () => {
  it("is stable across module instances so a shared container resolves", () => {
    // Symbol.for keys are equal across separate evaluations of the module,
    // which is what makes globalThis-cached containers work in Next.js.
    const a = token<number>("StableThing");
    const b = token<number>("StableThing");
    expect(a.key).toBe(b.key);

    const c = new Container();
    c.registerValue(a, 42);
    expect(c.resolve(b)).toBe(42);
  });

  it("keeps every TOKENS description unique, as Symbol.for requires", () => {
    const descriptions = Object.values(TOKENS).map((t) => t.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("does not collide with unrelated global symbols", () => {
    expect(token<number>("Clock").key).not.toBe(Symbol.for("Clock"));
  });
});
