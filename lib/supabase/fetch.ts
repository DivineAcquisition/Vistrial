/**
 * Vercel Marketplace injects `sb_publishable_…` / `sb_secret_…` keys. Those are
 * not JWTs. supabase-js still puts them on `Authorization: Bearer …` for Auth
 * and PostgREST; Kong then answers `Invalid JWT` and every server call dies
 * before sign-in can finish.
 *
 * Strip the API key from Bearer when it is a new-format key. Real user access
 * tokens (JWTs) are left alone. The key stays on the `apikey` header.
 */

function isNewApiKey(key: string): boolean {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

export function fetchForSupabaseKey(
  supabaseKey: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  if (!isNewApiKey(supabaseKey)) return baseFetch;

  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const auth = headers.get("Authorization");
    if (auth === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    if (!headers.has("apikey")) {
      headers.set("apikey", supabaseKey);
    }
    return baseFetch(input, { ...init, headers });
  };
}
