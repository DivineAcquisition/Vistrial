import { AGENT_RESULT_PAGE_SIZE } from "@/lib/agents/constants";
import type { AgentMode } from "@/lib/agents/types";

export type CacheableBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export function withPromptCache(text: string): CacheableBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function cacheLastTool<T extends Record<string, unknown>>(tools: T[]): T[] {
  if (tools.length === 0) return tools;
  return tools.map((tool, index) =>
    index === tools.length - 1 ? ({ ...tool, cache_control: { type: "ephemeral" } } as T) : tool,
  );
}

export function shouldUseBatchApi(mode: AgentMode, forceSync = false): boolean {
  if (forceSync) return false;
  return mode !== "on_demand";
}

export function pageToolResult<T>(rows: readonly T[], page = 0): { rows: T[]; hasMore: boolean } {
  const start = page * AGENT_RESULT_PAGE_SIZE;
  const slice = rows.slice(start, start + AGENT_RESULT_PAGE_SIZE);
  return { rows: slice as T[], hasMore: start + slice.length < rows.length };
}

export function batchDiscountFactor(): number {
  return 0.5;
}

export function cacheHitInputFactor(): number {
  return 0.1;
}
