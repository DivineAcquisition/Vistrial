import "server-only";

import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { evaluateRecentAuth, type RecentAuth } from "@/lib/staff/mfa";
import { staffDb } from "@/lib/staff/db";
import { safeInternalPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

type MfaRow = { user_id: string; enrolled: boolean; deadline: string | null };

/** Where this staff member stands for a sensitive action. Customers are always "ok". */
export async function recentAuthStatus(): Promise<RecentAuth> {
  const ctx = await getAuthContext();
  if (!ctx.platformRole) return "ok";
  const supabase = await createClient();
  const db = await staffDb();
  const [{ data: assurance }, { data: status }, { data: grant }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    db.rpc("staff_mfa_status"),
    db.rpc("staff_mfa_grant_until"),
  ]);
  const self = ((status ?? []) as MfaRow[]).find((row) => row.user_id === ctx.user.id);
  const methods = (assurance?.currentAuthenticationMethods ?? []).flatMap((entry) => {
    if (!entry || typeof entry === "string") return [];
    return [{ method: String(entry.method), timestamp: Number(entry.timestamp) }];
  });
  return evaluateRecentAuth({
    methods,
    enrolled: Boolean(self?.enrolled),
    deadline: self?.deadline ?? null,
    grantUntil: typeof grant === "string" ? grant : null,
    now: Date.now(),
  });
}

/** Sends a staff member to enroll or to confirm it is them. Returns when the check is recent. */
export async function assertRecentAuth(nextPath: string): Promise<void> {
  const status = await recentAuthStatus();
  if (status === "ok") return;
  const next = safeInternalPath(nextPath, "/app/team");
  const dest = status === "needs_setup" ? "/security/setup" : "/security/verify";
  redirect(`${dest}?next=${encodeURIComponent(next)}`);
}

/** Whether enforcement has passed this person's grace period, and the deadline while they are still inside it. */
export function mfaPrompt(row: MfaRow | null): { lock: boolean; graceUntil: string | null } {
  if (!row || row.enrolled || !row.deadline) return { lock: false, graceUntil: null };
  if (Date.parse(row.deadline) <= Date.now()) return { lock: true, graceUntil: null };
  return { lock: false, graceUntil: row.deadline };
}

export async function mfaSelf(): Promise<MfaRow | null> {
  const ctx = await getAuthContext();
  if (!ctx.platformRole) return null;
  const db = await staffDb();
  const { data } = await db.rpc("staff_mfa_status");
  return ((data ?? []) as MfaRow[]).find((row) => row.user_id === ctx.user.id) ?? null;
}
