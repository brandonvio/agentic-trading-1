import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load .env.local then .env (first wins) so tests see the same config as the app.
loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

// Never let a unit test accidentally talk to the dev database.
process.env.NEO4J_DATABASE = process.env.NEO4J_TEST_DATABASE ?? "agenticproptest";
process.env.LLM_PROVIDER = "mock";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";

// `server-only` throws outside the React server runtime; stub it for tests.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
