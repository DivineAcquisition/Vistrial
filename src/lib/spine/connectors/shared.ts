import type { ConnectorHealth, FieldMapping } from "@/lib/spine/contract";

export type Fetch = typeof fetch;

/** What every native connector is built from. Tokens are read on the server and never leave it. */
export type ConnectorDeps = {
  fetch: Fetch;
  /** The decrypted token or API key for a connection, or null when there is none. */
  credential: (connectionId: string) => Promise<string | null>;
  /** Connection setup chosen by a person (for example which Airtable base). */
  setup?: (connectionId: string) => Promise<Record<string, unknown>>;
  clientId?: string;
  now?: () => Date;
};

export class VendorError extends Error {
  constructor(
    readonly status: number,
    readonly code: "not_allowed" | "not_found" | "rate_limited" | "vendor_error",
  ) {
    super(code);
  }
}

export function vendorError(status: number): VendorError {
  if (status === 401 || status === 403) return new VendorError(status, "not_allowed");
  if (status === 404) return new VendorError(status, "not_found");
  if (status === 429) return new VendorError(status, "rate_limited");
  return new VendorError(status, "vendor_error");
}

export async function getJson<T>(fetcher: Fetch, url: string, headers: Record<string, string>, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetcher(url, {
    method: init.method ?? "GET",
    headers: { accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!response.ok) throw vendorError(response.status);
  return (await response.json()) as T;
}

export async function requireCredential(deps: ConnectorDeps, connectionId: string): Promise<string> {
  const token = await deps.credential(connectionId);
  if (!token) throw new VendorError(401, "not_allowed");
  return token;
}

/** Turns a failed health probe into what the Connections page shows. */
export function healthFromError(error: unknown, lastSyncAt: string | null): ConnectorHealth {
  if (error instanceof VendorError && error.code === "not_allowed") return { state: "needs_attention", lastSyncAt, problem: "The app turned down our access. Reconnect it.", reconnect: true };
  if (error instanceof VendorError && error.code === "rate_limited") return { state: "needs_attention", lastSyncAt, problem: "The app is limiting requests. Updates will resume shortly.", reconnect: false };
  return { state: "needs_attention", lastSyncAt, problem: "The app did not respond as expected.", reconnect: false };
}

export function mapKnown(vendorFields: string[], known: Record<string, string>): FieldMapping[] {
  return vendorFields.map((vendorField) => ({ vendorField, spineField: known[vendorField] ?? null, conflict: false }));
}

/** Only short scalar values cross into the spine. Long text from a connected app is never copied. */
export function scalar(value: unknown, max = 200): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > max ? value.slice(0, max) : value;
  return null;
}
