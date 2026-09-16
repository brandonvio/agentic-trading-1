import { withPublic } from "@/lib/api/handler";
import { getContainer } from "@/lib/container";
import { TOKENS } from "@/lib/core/tokens";

function llmProviderName(): string {
  try {
    return getContainer().resolve(TOKENS.llm).name;
  } catch {
    return process.env.LLM_PROVIDER ?? "unknown";
  }
}

export const GET = withPublic(async () => ({
  status: "ok" as const,
  time: new Date().toISOString(),
  persistence: process.env.PERSISTENCE === "memory" ? "memory" : "neo4j",
  llmProvider: llmProviderName(),
}));
