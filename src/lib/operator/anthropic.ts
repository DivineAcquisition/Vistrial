import "server-only";

import { anthropicApiKey, anthropicModel } from "@/lib/extraction/anthropic";
import { OPERATOR_MODEL_ENV } from "@/lib/operator/constants";
import { operatorAnthropicTools } from "@/lib/operator/catalog";
import { OPERATOR_SYSTEM_PROMPT } from "@/lib/operator/prompt";
import type { AgentContentBlock, AgentMessage } from "@/lib/operator/types";

export type OperatorModelEvent =
  | { type: "text"; delta: string }
  | { type: "message"; stopReason: string | null; inputTokens: number; outputTokens: number; content: AgentContentBlock[]; model: string };

export function operatorAgentModel(): string {
  return process.env[OPERATOR_MODEL_ENV]?.trim() || anthropicModel();
}

function parseBlock(block: { type?: string; text?: string; id?: string; name?: string; input?: unknown }): AgentContentBlock | null {
  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input ?? {} };
  }
  return null;
}

export async function streamOperatorMessage(input: {
  messages: AgentMessage[];
  onEvent: (event: OperatorModelEvent) => void;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Extract<OperatorModelEvent, { type: "message" }>> {
  const key = anthropicApiKey();
  if (!key) throw new Error("The language model is not configured.");

  const model = operatorAgentModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const onAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onAbort);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system: OPERATOR_SYSTEM_PROMPT,
        tools: operatorAnthropicTools(),
        messages: input.messages,
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The language model timed out.");
    throw new Error("The language model could not be reached.");
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok || !response.body) {
    throw new Error("The language model returned an error.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const content: AgentContentBlock[] = [];
  let current: AgentContentBlock | null = null;
  let jsonAcc = "";
  let stopReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let usedModel = model;

  const flushBlock = () => {
    if (current) {
      content.push(current);
      current = null;
    }
  };

  const handleEvent = (raw: string) => {
    let event: {
      type?: string;
      index?: number;
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null };
      content_block?: { type?: string; text?: string; id?: string; name?: string; input?: unknown };
      message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string | null };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return;
    }
    if (event.type === "message_start" && event.message) {
      usedModel = event.message.model ?? usedModel;
      inputTokens += event.message.usage?.input_tokens ?? 0;
      outputTokens += event.message.usage?.output_tokens ?? 0;
    }
    if (event.type === "content_block_start" && event.content_block) {
      flushBlock();
      if (event.content_block.type === "text") {
        current = { type: "text", text: event.content_block.text ?? "" };
      } else if (event.content_block.type === "tool_use") {
        current = {
          type: "tool_use",
          id: event.content_block.id ?? "",
          name: event.content_block.name ?? "",
          input: {},
        };
        jsonAcc = "";
      }
    }
    if (event.type === "content_block_delta" && event.delta) {
      if (event.delta.type === "text_delta" && current?.type === "text" && event.delta.text) {
        current.text += event.delta.text;
        input.onEvent({ type: "text", delta: event.delta.text });
      }
      if (event.delta.type === "input_json_delta" && current?.type === "tool_use" && event.delta.partial_json) {
        jsonAcc += event.delta.partial_json;
      }
    }
    if (event.type === "content_block_stop" && current?.type === "tool_use") {
      if (jsonAcc) {
        try {
          current.input = JSON.parse(jsonAcc) as unknown;
        } catch {
          current.input = {};
        }
      }
    }
    if (event.type === "message_delta") {
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      outputTokens += event.usage?.output_tokens ?? 0;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      handleEvent(data);
    }
  }
  if (buffer.trim().startsWith("data:")) {
    handleEvent(buffer.trim().slice(5).trim());
  }
  flushBlock();

  const message: Extract<OperatorModelEvent, { type: "message" }> = {
    type: "message",
    stopReason,
    inputTokens,
    outputTokens,
    content: content.filter((block) => (block.type === "text" ? block.text.length > 0 : Boolean(block.name))),
    model: usedModel,
  };
  input.onEvent(message);
  return message;
}
