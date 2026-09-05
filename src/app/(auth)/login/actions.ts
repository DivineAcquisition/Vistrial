"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { PENDING_INVITE_COOKIE, pendingInviteCookieOptions } from "@/lib/auth/cookies";
import { classifyAuthError, type LoginError } from "@/lib/auth/errors";
import {
  authCallbackUrl,
  inviteTokenFromPath,
  isAcceptInvitePath,
  safeInternalPath,
} from "@/lib/auth/paths";
import { listActiveMemberships } from "@/lib/auth/session";
import { appUrl, originFromForwardedHost } from "@/lib/app-url";
import { defaultInternalPath, signedInPath } from "@/lib/domains/landing";
import { classifyProductHost } from "@/lib/marketing/hosts";
import { rateLimitAuth, requestIp } from "@/lib/ops/rate-limit";
import { checkIsStellarDaOperator } from "@/lib/stellar/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

async function requestProductHost() {
  const headerStore = await headers();
  return classifyProductHost(
    headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  );
}

async function rememberPendingInvite(next: string) {
  if (!isAcceptInvitePath(next)) return;
  const token = inviteTokenFromPath(next);
  if (!token) return;
  const cookieStore = await cookies();
  cookieStore.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions);
}

async function enforceAuthRateLimit(email: string): Promise<LoginError | null> {
  try {
    const headerStore = await headers();
    const limited = await rateLimitAuth(getSupabaseAdmin(), email, requestIp(headerStore));
    if (!limited.allowed) return "locked";
  } catch {
    return null;
  }
  return null;
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
  const product = await requestProductHost();
  const next = safeInternalPath(
    String(formData.get("redirectTo") ?? ""),
    defaultInternalPath(product)
  );

  if (!email || !password) {
    return { error: "generic" };
  }

  const locked = await enforceAuthRateLimit(email);
  if (locked) return { error: locked };

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

  const memberships = await listActiveMemberships(userId);
  if (memberships.length === 0) {
    if (await checkIsStellarDaOperator()) {
      redirect(signedInPath({ product, next, stellarDaOperator: true }));
    }
    const { data: platformAdmin, error: adminError } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminError) {
      return { error: "generic" };
    }
    if (!platformAdmin) {
      return { error: "no_membership" };
    }
  }

  redirect(
    signedInPath({
      product,
      next,
      surfaceAccess: memberships[0]?.surfaceAccess,
    })
  );
}

export async function sendMagicLink(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "generic" };
  }

  const email = String(formData.get("email") ?? "").trim();
  const product = await requestProductHost();
  const next = safeInternalPath(
    String(formData.get("redirectTo") ?? ""),
    defaultInternalPath(product)
  );

  if (!email) {
    return { error: "generic" };
  }

  const locked = await enforceAuthRateLimit(email);
  if (locked) return { error: locked };

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
