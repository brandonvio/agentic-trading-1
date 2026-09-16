/**
 * Helpers for the "final answer is a fenced JSON block" convention shared by
 * the prompt builders, the mock provider and the agent runtime.
 */
import type { LLMContentBlock, LLMMessage } from "./types";

const FENCE_RE = /```json\s*([\s\S]*?)```/gi;

/** Returns the parsed object of the LAST fenced ```json block in `text`, or null. */
export function extractJsonBlock(text: string): Record<string, unknown> | null {
  let last: string | null = null;
  for (const m of text.matchAll(FENCE_RE)) last = m[1];
  if (last === null) {
    // Fall back to a bare top-level object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    last = text.slice(start, end + 1);
  }
  return parseObject(last);
}

/** Parse a JSON string, returning null unless it is a plain object. */
export function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Wrap an object in a fenced ```json block. */
export function fenceJson(value: unknown): string {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

/** Concatenate all text blocks of a message. */
export function messageText(msg: LLMMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is Extract<LLMContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Rough token estimate used by the mock provider: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
