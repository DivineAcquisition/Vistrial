"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { getAuthContext } from "@/lib/auth/session";
import { logWorkspaceActivity } from "@/lib/workspaces/activity";
import { landingPath } from "@/lib/navigation";

/**
 * Make another workspace the active one. Only workspaces the database already
 * returned for this person are accepted, and the caller reloads the page so no
 * state from the previous workspace survives. Staff entering a customer
 * workspace is recorded in the activity log.
 */
export async function switchOrg(orgId: string) {
  const ctx = await getAuthContext();
  const target = ctx.memberships.find((membership) => membership.orgId === orgId);
  if (!target) {
    return { ok: false as const, error: "That workspace is not available to you." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, orgCookieOptions);

  if (ctx.platformRole && orgId !== ctx.org.id) {
    await logWorkspaceActivity({
      actorUserId: ctx.user.id,
      orgId,
      action: "workspace.entered",
      detail: { from_org_id: ctx.org.id },
    });
  }

  revalidatePath("/", "layout");
  return {
    ok: true as const,
    landing: landingPath(target.surfaceAccess, target.role),
  };
}

/** Align the org cookie with a membership the user already has. No revalidate. */
export async function persistActiveOrg(orgId: string) {
  const ctx = await getAuthContext();
  const belongs = ctx.memberships.some((membership) => membership.orgId === orgId);
  if (!belongs) return;

  const cookieStore = await cookies();
  if (cookieStore.get(ORG_COOKIE_NAME)?.value === orgId) return;
  cookieStore.set(ORG_COOKIE_NAME, orgId, orgCookieOptions);
}
