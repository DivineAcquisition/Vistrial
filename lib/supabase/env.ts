/**
 * Which Supabase project this deploy talks to comes from the environment and
 * nowhere else. No fallback project: a deploy that forgets its variables should
 * show the "not connected" state, not quietly read and write the live project.
 *
 * Accepts both the classic names and the Vercel Marketplace names
 * (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, publishable keys).
 */
export type SupabaseEnv = { url: string; publishableKey: string };

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** Project URL — public or server-only Marketplace name. */
export function supabaseUrl(): string {
  return firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

/**
 * Anon / publishable key for session clients.
 *
 * Prefer the classic JWT `anon` key when both are present — Kong and older
 * gateways always accept it as `Authorization: Bearer`. The Marketplace
 * `sb_publishable_…` key still works once the fetch wrapper strips Bearer.
 */
export function supabasePublishableKey(): string {
  return firstEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY"
  );
}

/**
 * Service-role / secret key. Never expose to the browser — only use from
 * server modules that already import `server-only`.
 */
export function supabaseServiceRoleKey(): string {
  return firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = supabaseUrl();
  const publishableKey = supabasePublishableKey();

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
