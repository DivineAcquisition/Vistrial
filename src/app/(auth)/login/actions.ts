"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { PENDING_INVITE_COOKIE, pendingInviteCookieOptions } from "@/lib/auth/cookies";
import { classifyAuthError, type LoginError } from "@/lib/auth/errors";
import {
  authCallbackUrl,
  inviteTokenFromPath,
  isAcceptInvitePath,
  postAuthPath,
  safeInternalPath,
} from "@/lib/auth/paths";
import { appUrl, originFromForwardedHost } from "@/lib/app-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LoginActionState = { error: LoginError | null; magicSent?: boolean };

async function requestAppOrigin(): Promise<string> {
  const headerStore = await headers();
  return (
    originFromForwardedHost({
      host: headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
      proto: headerStore.get("x-forwarded-proto"),
    }) ?? appUrl()
  );
}

async function rememberPendingInvite(next: string) {
  if (!isAcceptInvitePath(next)) return;
  const token = inviteTokenFromPath(next);
  if (!token) return;
  const cookieStore = await cookies();
  cookieStore.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions);
}

export async function signInPassword(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "generic" };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeInternalPath(String(formData.get("redirectTo") ?? ""));

  if (!email || !password) {
    return { error: "generic" };
  }

  await rememberPendingInvite(next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: classifyAuthError(error.message, error.code) };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "generic" };
  }

  const [{ data: memberships, error: memberError }, { data: platformAdmin, error: adminError }] =
    await Promise.all([
      supabase.from("org_members").select("id").eq("user_id", userId).eq("active", true).limit(1),
      supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

  if (memberError || adminError) {
    return { error: "generic" };
  }

  if (!memberships?.length && !platformAdmin) {
    return { error: "no_membership" };
  }

  redirect(postAuthPath(next));
}

export async function sendMagicLink(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "generic" };
  }

  const email = String(formData.get("email") ?? "").trim();
  const next = safeInternalPath(String(formData.get("redirectTo") ?? ""));

  if (!email) {
    return { error: "generic" };
  }

  await rememberPendingInvite(next);

  const origin = await requestAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authCallbackUrl(next, origin),
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { error: classifyAuthError(error.message, error.code) };
  }

  return { error: null, magicSent: true };
}
