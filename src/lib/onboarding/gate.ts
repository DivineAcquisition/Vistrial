import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ONBOARDING_DEFER_COOKIE } from "@/lib/auth/cookies";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { firstIncompleteStage, type ProfileStage } from "@/lib/profile/stages";
import { createClient } from "@/lib/supabase/server";

const SKIP_PREFIXES = ["/app/onboarding", "/app/settings", "/app/ops"];

function pathOnly(value: string | null): string {
  if (!value) return "";
  const cut = value.split("?")[0] ?? "";
  return cut;
}

export async function loadFirstIncompleteOnboardingStage(
  orgId: string
): Promise<ProfileStage | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_profile_stages")
    .select("stage, completed_at")
    .eq("org_id", orgId);
  return firstIncompleteStage(
    (data ?? []).map((row) => ({
      stage: row.stage,
      completedAt: row.completed_at,
    }))
  );
}

/**
 * Owners and admins who have not finished the wizard land in it until they
 * complete it or defer. DA operators and setters/closers are not intercepted.
 */
export async function redirectIfOnboardingIncomplete(): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.isPlatformAdmin) return;
  if (!canManageOrgSettings(ctx.role, false)) return;

  const path = pathOnly((await headers()).get("x-vistrial-pathname"));
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return;
  }

  const deferredOrg = (await cookies()).get(ONBOARDING_DEFER_COOKIE)?.value;
  if (deferredOrg === ctx.org.id) return;

  const incomplete = await loadFirstIncompleteOnboardingStage(ctx.org.id);
  if (!incomplete) return;
  redirect(`/app/onboarding/${incomplete}`);
}
