/**
 * Tiny, typed dependency-injection container.
 *
 * - `Token<T>` is a branded symbol carrying the service type.
 * - Registrations are lazy factories; singletons are memoised per container.
 * - `createChild()` lets tests override a subset of registrations without
 *   mutating the shared root container.
 */
export interface Token<T> {
  readonly key: symbol;
  readonly description: string;
  /** phantom type carrier */
  readonly __type?: T;
}

/**
 * Tokens use the global symbol registry (`Symbol.for`) rather than `Symbol()`.
 *
 * Next.js evaluates a module once per bundle, so `lib/core/tokens.ts` can be
 * instantiated more than once in a single process (route handlers and server
 * components land in different bundles, and HMR re-evaluates modules). Unique
 * symbols would then differ between instances and a container built by one
 * would fail to resolve tokens held by the other. Registry symbols are equal
 * across every instance, so `description` must be unique per token.
 */
export function token<T>(description: string): Token<T> {
  return { key: Symbol.for(`agentic-prop:${description}`), description };
}

type Factory<T> = (c: Container) => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private readonly registrations = new Map<symbol, Registration<unknown>>();

  constructor(private readonly parent?: Container) {}

  register<T>(tok: Token<T>, factory: Factory<T>, opts: { singleton?: boolean } = {}): this {
    this.registrations.set(tok.key, { factory, singleton: opts.singleton ?? true });
    return this;
  }

  /** Register a pre-built value. */
  registerValue<T>(tok: Token<T>, value: T): this {
    this.registrations.set(tok.key, { factory: () => value, singleton: true, instance: value });
    return this;
  }

  has<T>(tok: Token<T>): boolean {
    return this.registrations.has(tok.key) || (this.parent?.has(tok) ?? false);
  }

  resolve<T>(tok: Token<T>): T {
    const reg = this.registrations.get(tok.key) as Registration<T> | undefined;
    if (!reg) {
      if (this.parent) return this.parent.resolve(tok);
      throw new Error(`No registration for token '${tok.description}'`);
    }
    if (reg.singleton) {
      if (reg.instance === undefined) reg.instance = reg.factory(this);
      return reg.instance;
    }
    return reg.factory(this);
  }

  createChild(): Container {
    return new Container(this);
  }
}
