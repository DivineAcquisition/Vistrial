"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { getAuthContext } from "@/lib/auth/session";

export async function switchOrg(orgId: string) {
  const ctx = await getAuthContext();
  const belongs = ctx.memberships.some((membership) => membership.orgId === orgId);
  if (!belongs) {
    return { ok: false as const, error: "You do not belong to that organization." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, orgCookieOptions);
  revalidatePath("/", "layout");
  return { ok: true as const };
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
