import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const SKIP_PREFIXES = ["/app/onboarding", "/app/settings", "/app/ops", "/app/help", "/app/notifications"];

function pathOnly(value: string | null): string {
  if (!value) return "";
  return value.split("?")[0] ?? "";
}

/**
 * An Owner whose workspace is still being set up lands on the guided setup on
 * their first sign-in. After they have seen its welcome, setup is reached from
 * the progress card on Home and never forced again. Staff, Members and
 * Operators are never redirected.
 */
export async function redirectIfOnboardingIncomplete(): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.isStaff || ctx.workspaceRole !== "owner") return;

  const path = pathOnly((await headers()).get("x-vistrial-pathname"));
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;

  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: status }, { data: flags }] = await Promise.all([
    db.from("workspace_onboarding_status").select("phase").eq("org_id", ctx.org.id).maybeSingle(),
    db.from("onboarding_member_flags").select("welcome_seen_at").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle(),
  ]);
  const phase = (status as { phase?: string } | null)?.phase;
  if (phase !== "setup" && phase !== "ready_for_review") return;
  if ((flags as { welcome_seen_at?: string | null } | null)?.welcome_seen_at) return;
  redirect("/app/onboarding");
}
