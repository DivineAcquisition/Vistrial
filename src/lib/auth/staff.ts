import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { safeInternalPath } from "@/lib/auth/paths";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { DEFAULT_APP_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffContext = {
  user: User;
  isPlatformAdmin: true;
};

/**
 * Vistrial staff identity. Independent of org membership and org roles.
 * Client members who are not in platform_admins never get this context.
 */
export const getStaffContext = cache(async (): Promise<StaffContext> => {
  const user = await getSessionUser();
  if (!user) {
    const headerStore = await headers();
    const fromHeader = headerStore.get("x-vistrial-pathname");
    const dest = safeInternalPath(fromHeader, "/ops");
    redirect(`/login?redirect=${encodeURIComponent(dest)}`);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    const memberships = await listActiveMemberships(user.id);
    redirect(memberships.length > 0 ? DEFAULT_APP_PATH : "/no-access");
  }

  return { user, isPlatformAdmin: true };
});

export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
