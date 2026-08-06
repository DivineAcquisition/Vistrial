/**
 * Which Supabase project this deploy talks to comes from the environment and
 * nowhere else. No fallback: a deploy that forgets its variables should show the
 * "not connected" state, not quietly read and write the live project.
 */
export type SupabaseEnv = { url: string; publishableKey: string };

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = firstEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = firstEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
