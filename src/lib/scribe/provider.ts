/**
 * When an outside model service cannot take work right now (no credits, rate
 * limited, down, or no key set), Scribe waits and resumes on its own instead
 * of spending an attempt. Pure so it can be tested.
 */
export class ProviderUnavailable extends Error {
  readonly provider: "gemini" | "anthropic";
  readonly status: number | null;

  constructor(provider: "gemini" | "anthropic", reason: string, status: number | null = null) {
    super(`${provider}_unavailable:${reason}`);
    this.name = "ProviderUnavailable";
    this.provider = provider;
    this.status = status;
  }
}

/** HTTP statuses that mean "try again later", not "this request is wrong". */
export function isUnavailableStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 408 || status === 429 || status >= 500;
}

/** Classify an error thrown by createAnthropicMessage. */
export function anthropicUnavailable(cause: unknown): ProviderUnavailable | null {
  if (!(cause instanceof Error)) return null;
  if (cause.message === "missing_api_key") return new ProviderUnavailable("anthropic", "missing_key");
  if (cause.message === "anthropic_timeout") return new ProviderUnavailable("anthropic", "timeout");
  if (cause.message === "anthropic_http") {
    const status = (cause as Error & { status?: number }).status;
    if (status == null) return new ProviderUnavailable("anthropic", "network");
    if (isUnavailableStatus(status)) return new ProviderUnavailable("anthropic", `http_${status}`, status);
  }
  return null;
}
