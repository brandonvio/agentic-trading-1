import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Generates a compact, URL-safe, prefixed identifier: e.g. `ord_3k9x2p7q1a`. */
export function newId(prefix: string, length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Deterministic id generator for seeds and tests (sequential per prefix). */
export class SequentialIdGenerator implements IdGenerator {
  private counters = new Map<string, number>();
  constructor(private readonly seedTag = "seed") {}
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${this.seedTag}${String(n).padStart(4, "0")}`;
  }
}

export interface IdGenerator {
  next(prefix: string): string;
}

export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return newId(prefix);
  }
}

export const ID_PREFIX = {
  user: "usr",
  role: "role",
  permission: "perm",
  desk: "desk",
  portfolio: "pf",
  brokerAccount: "acct",
  instrument: "ins",
  position: "pos",
  order: "ord",
  fill: "fill",
  strategy: "strat",
  agent: "agt",
  agentRun: "run",
  agentStep: "step",
  signal: "sig",
  riskLimit: "lim",
  riskBreach: "brch",
  approval: "apr",
  audit: "aud",
  backtest: "bt",
  session: "sess",
} as const;
