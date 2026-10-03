import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";

import { assertModelAllowed } from "@/lib/agents/model-config";
import { resolveModel } from "@/lib/agents/router";
import { anthropicApiKey } from "@/lib/extraction/anthropic";

/** Optional override for the conversation model. Same allowlist as every other route. */
export const SALES_OS_MODEL_ENV = "SALES_OS_MODEL";

export class SalesOsUnavailable extends Error {}

export function salesOsModel(use: "conversation" | "asset") {
  const key = anthropicApiKey();
  if (!key) throw new SalesOsUnavailable("Vistrial can't think right now: the model key isn't set for this deployment.");
  const resolved = resolveModel({ workKind: use === "asset" ? "playbook" : "agent_planning", mode: "on_demand" });
  const override = use === "conversation" ? process.env[SALES_OS_MODEL_ENV]?.trim() : undefined;
  const modelId = override || resolved.modelId;
  assertModelAllowed(modelId);
  return { model: createAnthropic({ apiKey: key })(modelId), modelId };
}
