import neo4j, { type Driver, type Session, type ManagedTransaction, type QueryResult, type RecordShape } from "neo4j-driver";

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
}

export function neo4jConfigFromEnv(overrides: Partial<Neo4jConfig> = {}): Neo4jConfig {
  return {
    uri: process.env.NEO4J_URI ?? "bolt://localhost:7687",
    user: process.env.NEO4J_USER ?? "neo4j",
    password: process.env.NEO4J_PASSWORD ?? "password123",
    database: process.env.NEO4J_DATABASE ?? "agenticprop",
    ...overrides,
  };
}

export function testNeo4jConfig(): Neo4jConfig {
  return neo4jConfigFromEnv({ database: process.env.NEO4J_TEST_DATABASE ?? "agenticproptest" });
}

export type CypherParams = Record<string, unknown>;

/**
 * Thin wrapper over the driver that pins a database and exposes read/write
 * helpers returning plain objects. Integers come back as JS numbers
 * (disableLosslessIntegers) — all our numeric values are within safe range.
 */
export class Neo4jClient {
  private driver: Driver | null = null;
  readonly database: string;

  constructor(private readonly config: Neo4jConfig) {
    this.database = config.database;
  }

  getDriver(): Driver {
    if (!this.driver) {
      this.driver = neo4j.driver(this.config.uri, neo4j.auth.basic(this.config.user, this.config.password), {
        disableLosslessIntegers: true,
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
      });
    }
    return this.driver;
  }

  session(mode: "READ" | "WRITE" = "WRITE"): Session {
    return this.getDriver().session({
      database: this.database,
      defaultAccessMode: mode === "READ" ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }

  async read<T extends RecordShape = RecordShape>(cypher: string, params: CypherParams = {}): Promise<T[]> {
    const s = this.session("READ");
    try {
      const res = await s.executeRead((tx) => tx.run<T>(cypher, params));
      return res.records.map((r) => r.toObject() as T);
    } finally {
      await s.close();
    }
  }

  async write<T extends RecordShape = RecordShape>(cypher: string, params: CypherParams = {}): Promise<T[]> {
    const s = this.session("WRITE");
    try {
      const res = await s.executeWrite((tx) => tx.run<T>(cypher, params));
      return res.records.map((r) => r.toObject() as T);
    } finally {
      await s.close();
    }
  }

  /** Run several statements in one write transaction. */
  async writeTx<T>(fn: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const s = this.session("WRITE");
    try {
      return await s.executeWrite(fn);
    } finally {
      await s.close();
    }
  }

  async readOne<T extends RecordShape = RecordShape>(cypher: string, params: CypherParams = {}): Promise<T | null> {
    const rows = await this.read<T>(cypher, params);
    return rows[0] ?? null;
  }

  async writeOne<T extends RecordShape = RecordShape>(cypher: string, params: CypherParams = {}): Promise<T | null> {
    const rows = await this.write<T>(cypher, params);
    return rows[0] ?? null;
  }

  async verifyConnectivity(): Promise<void> {
    await this.getDriver().verifyConnectivity({ database: this.database });
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

export type { QueryResult, ManagedTransaction };

/** Convert Neo4j temporal/complex values into JSON-safe primitives. */
export function toPlain<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) return value as T;
  if (neo4j.isInt(value)) return (value as { toNumber(): number }).toNumber() as T;
  if (neo4j.isDateTime(value) || neo4j.isDate(value) || neo4j.isLocalDateTime(value)) {
    return String(value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => toPlain(v)) as T;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("properties" in obj && "labels" in obj) return toPlain(obj.properties) as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toPlain(v);
    return out as T;
  }
  return value as T;
}

let sharedClient: Neo4jClient | null = null;

/** Process-wide singleton for the Next.js runtime; tests construct their own. */
export function getNeo4jClient(): Neo4jClient {
  if (!sharedClient) sharedClient = new Neo4jClient(neo4jConfigFromEnv());
  return sharedClient;
}
