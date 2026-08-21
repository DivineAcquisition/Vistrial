/**
 * Public Supabase env (URL + anon/publishable key). Safe to import from
 * Client Components. Service-role lives in env-server.ts.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when the property name is
 * a static identifier. A dynamic lookup from a name array is blank in the
 * browser bundle, which made production sign-in throw "Supabase is not
 * configured" before Auth ran.
 *
 * Prefer the classic JWT `anon` key when both are present — Kong always accepts
 * it as `Authorization: Bearer`. Marketplace `sb_publishable_…` keys still work
 * once `fetchForSupabaseKey` strips them from Bearer.
 */

function firstPresent(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Project URL — public or server-only Marketplace name. */
export function supabaseUrl(): string {
  return firstPresent(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
}

/** Anon / publishable key for session clients. */
export function supabasePublishableKey(): string {
  return firstPresent(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function requireSupabaseBrowserEnv(): { url: string; key: string } {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or the Vercel Marketplace aliases SUPABASE_URL / SUPABASE_ANON_KEY)."
    );
  }
  return { url, key };
}

export function supabasePublishableKeyKind(
  key = supabasePublishableKey()
): "anon_jwt" | "publishable" | "other" | null {
  if (!key) return null;
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("eyJ")) return "anon_jwt";
  return "other";
}
