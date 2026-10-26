import { WORK_KINDS, type WorkKind } from "./registry";

export type ModelRoute = {
  provider: string;
  model: string;
  fallbackProvider: string;
  fallbackModel: string;
};

export type Completion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  provider: string;
  model: string;
};

export function isWorkKind(value: string): value is WorkKind {
  return (WORK_KINDS as readonly string[]).includes(value);
}

/** Application code asks for a work kind. The route decides the model. */
export async function complete(route: ModelRoute, workKind: WorkKind, input: string): Promise<Completion> {
  if (route.provider === "claude") return claudeComplete(route, workKind, input);
  return fakeComplete(route, workKind);
}

export function fakeComplete(route: ModelRoute, _workKind: WorkKind): Completion {
  const costCents = route.model === "fake-expensive" ? 30 : 1;
  return {
    text: "ok",
    inputTokens: 10,
    outputTokens: 5,
    costCents,
    provider: route.provider,
    model: route.model,
  };
}

export async function claudeComplete(route: ModelRoute, _workKind: WorkKind, input: string): Promise<Completion> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Model key is not set.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 32,
      messages: [{ role: "user", content: input.slice(0, 4000) }],
    }),
  });
  if (!response.ok) throw new Error("The model call failed.");
  const json = (await response.json()) as {
    content?: { text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  return {
    text: json.content?.[0]?.text ?? "",
    inputTokens,
    outputTokens,
    costCents: Math.max(1, Math.ceil((inputTokens + outputTokens) / 1000)),
    provider: "claude",
    model: route.model,
  };
}
