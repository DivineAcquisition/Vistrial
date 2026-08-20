/**
 * Public Supabase env (URL + anon/publishable key). Safe to import from
 * Client Components. Service-role lives in env-server.ts.
 *
 * Accepts both the classic names and the Vercel Marketplace names
 * (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, publishable keys).
 */

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

/** Anon / publishable key for session clients. */
export function supabasePublishableKey(): string {
  return firstEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY"
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
