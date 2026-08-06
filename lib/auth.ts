import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { supabaseEnv } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/session";

export type AdminUser = { id: string; email: string };

/**
 * Resolves the caller from the session cookie. Uses getUser() rather than
 * getSession() so the token is validated against the auth server instead of
 * being trusted from a cookie.
 */
export const getCurrentUser = cache(async (): Promise<AdminUser | null> => {
  if (!supabaseEnv()) return null;

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
});

/** Server-side guard for pages and actions. The proxy redirects first; this
 * stops a direct action invocation from reaching the database without a session. */
export async function requireUser(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
