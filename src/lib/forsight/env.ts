import "server-only";

/**
 * Forsight authenticates with Divine Acquisition's own credentials, one per
 * platform rather than one per workspace. That works because DA owns every
 * Airtable base and ad account Forsight reads, ours and our clients'. Which
 * base or ad account a workspace reads is a database row, not an env var, so
 * adding a client is never a deployment.
 *
 * No screen ever collects any of these.
 */

export function airtableApiKey(env = process.env): string {
  return env.AIRTABLE_API_KEY?.trim() ?? "";
}

export function airtableConfigured(env = process.env): boolean {
  return airtableApiKey(env).length > 0;
}

export function airtableApiBase(env = process.env): string {
  return env.AIRTABLE_API_BASE?.trim() || "https://api.airtable.com/v0";
}

export function metaAccessToken(env = process.env): string {
  return env.META_ACCESS_TOKEN?.trim() ?? "";
}

/**
 * The DA ad account. Workspace source records carry their own ad account id;
 * this is only the fallback used when seeding DA's own source.
 */
export function metaAdAccountId(env = process.env): string {
  return env.META_AD_ACCOUNT_ID?.trim() ?? "";
}

export function metaConfigured(env = process.env): boolean {
  return metaAccessToken(env).length > 0;
}

/** Pinned. Meta fails unversioned Marketing API calls outright. */
export function metaGraphApiVersion(env = process.env): string {
  return env.META_GRAPH_API_VERSION?.trim() || "v26.0";
}

export function metaGraphApiBase(env = process.env): string {
  return `${env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com"}/${metaGraphApiVersion(env)}`;
}

/** Meta wants `act_<id>`. Operators paste the bare number about half the time. */
export function normalizeMetaAdAccountId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}
