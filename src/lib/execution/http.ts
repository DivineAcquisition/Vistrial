import { ProviderError } from "@/lib/execution/errors";

const TIMEOUT_MS = 12_000;

/**
 * fetch with a deadline. A network failure becomes a transient, plain-language
 * error; the underlying message is dropped because it can echo a URL or header.
 */
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ProviderError("Could not reach the service. Try again in a minute.", "transient");
  }
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await res.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Clip to a provider's limit without cutting the last word in half. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
