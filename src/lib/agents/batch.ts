import "server-only";

import { anthropicApiKey } from "@/lib/extraction/anthropic";
import { assertModelAllowed } from "@/lib/agents/model-config";
import type { AgentContentBlock } from "@/lib/operator/types";

export type BatchTurn = {
  content: AgentContentBlock[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  model: string;
  stopReason: string | null;
};

function parseBlocks(blocks: unknown): AgentContentBlock[] {
  if (!Array.isArray(blocks)) return [];
  const out: AgentContentBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const rec = block as { type?: string; text?: string; id?: string; name?: string; input?: unknown };
    if (rec.type === "text" && typeof rec.text === "string") {
      out.push({ type: "text", text: rec.text });
    }
    if (rec.type === "tool_use" && typeof rec.id === "string" && typeof rec.name === "string") {
      out.push({ type: "tool_use", id: rec.id, name: rec.name, input: rec.input ?? {} });
    }
  }
  return out;
}

export async function submitMessageBatch(args: {
  model: string;
  customId: string;
  body: Record<string, unknown>;
}): Promise<{ batchId: string }> {
  assertModelAllowed(args.model);
  const key = anthropicApiKey();
  if (!key) throw new Error("The language model is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      requests: [{ custom_id: args.customId, params: { ...args.body, model: args.model } }],
    }),
  });
  if (!response.ok) throw new Error("The batch request failed.");
  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error("The batch request failed.");
  return { batchId: json.id };
}

export async function pollMessageBatch(batchId: string): Promise<
  | { status: "in_progress" }
  | { status: "ended"; turn: BatchTurn }
  | { status: "failed"; error: string }
> {
  const key = anthropicApiKey();
  if (!key) throw new Error("The language model is not configured.");
  const response = await fetch(`https://api.anthropic.com/v1/messages/batches/${encodeURIComponent(batchId)}`, {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!response.ok) return { status: "failed", error: "The batch poll failed." };
  const json = (await response.json()) as {
    processing_status?: string;
    request_counts?: { succeeded?: number; errored?: number };
  };
  if (json.processing_status && json.processing_status !== "ended") {
    return { status: "in_progress" };
  }
  const results = await fetch(
    `https://api.anthropic.com/v1/messages/batches/${encodeURIComponent(batchId)}/results`,
    {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    },
  );
  if (!results.ok) return { status: "failed", error: "The batch results failed." };
  const text = await results.text();
  const first = text.split("\n").find((line) => line.trim());
  if (!first) return { status: "failed", error: "The batch returned no result." };
  let row: {
    result?: {
      type?: string;
      message?: {
        model?: string;
        content?: unknown;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
        stop_reason?: string | null;
      };
    };
  };
  try {
    row = JSON.parse(first) as typeof row;
  } catch {
    return { status: "failed", error: "The batch result was not readable." };
  }
  const message = row.result?.message;
  if (!message) return { status: "failed", error: "The batch result had no message." };
  return {
    status: "ended",
    turn: {
      content: parseBlocks(message.content),
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
      model: message.model ?? "",
      stopReason: message.stop_reason ?? null,
    },
  };
}
