import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext, getSessionUser } from "@/lib/auth/session";
import type { CompassAccess } from "@/lib/compass/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Who Compass runs as: the signed-in person, through their own cookie-bound
 * database client. Every lookup goes through that client, so row-level
 * security and the database's own checks decide what they see. There is no
 * service-role path for reading workspace data.
 */
export type CompassActor = {
  db: SupabaseClient;
  orgId: string;
  orgName: string;
  timeZone: string;
  userId: string;
  memberId: string | null;
  personName: string;
  access: CompassAccess;
  isStaff: boolean;
  canSeeTranscripts: boolean;
  canSeeMoney: boolean;
  canSeePeople: boolean;
  canApprove: boolean;
  available: boolean;
  unavailableReason: string | null;
};

const ACCESS = new Set<CompassAccess>(["owner", "member", "operator", "service_team", "platform_admin"]);

async function flag(db: SupabaseClient, fn: string, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc(fn, { p_org_id: orgId });
  return !error && data === true;
}

export async function compassActor(): Promise<CompassActor> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const [availability, transcripts, money, people, approve] = await Promise.all([
    db.rpc("compass_availability", { p_org_id: ctx.org.id }),
    flag(db, "ws_can_see_transcripts", ctx.org.id),
    flag(db, "portal_can_see_money", ctx.org.id),
    flag(db, "portal_can_see_people", ctx.org.id),
    flag(db, "ws_can_approve", ctx.org.id),
  ]);
  const info = (availability.data ?? {}) as { available?: boolean; reason?: string | null; access?: string };
  const access = ACCESS.has(info.access as CompassAccess) ? (info.access as CompassAccess) : "member";
  return {
    db,
    orgId: ctx.org.id,
    orgName: ctx.org.name,
    timeZone: ctx.org.timezone || "UTC",
    userId: ctx.user.id,
    memberId: ctx.member?.id ?? null,
    personName: ctx.member?.displayName || "you",
    access,
    isStaff: ctx.isStaff,
    canSeeTranscripts: transcripts,
    canSeeMoney: money,
    canSeePeople: people,
    canApprove: approve,
    available: info.available === true,
    unavailableReason: info.available === true ? null : (info.reason ?? "coming_soon"),
  };
}

/** For route handlers, which answer 401 instead of redirecting to sign in. */
export async function compassActorOrNull(): Promise<CompassActor | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return compassActor();
}

export function unavailableMessage(reason: string | null): string {
  switch (reason) {
    case "paused":
      return "Compass is paused for this workspace. An Owner can resume it from Agents.";
    case "halted":
      return "Vistrial's agents are paused right now. Compass will be back shortly.";
    case "workspace_closed":
      return "This workspace is closed, so Compass is not available.";
    case "workspace_paused":
      return "This workspace is paused, so Compass is not available right now.";
    case "off":
      return "Compass is switched off for this workspace. The Vistrial team can switch it back on.";
    case "coming_soon":
      return "Compass is coming soon for this workspace. Your team switches it on after the other agents.";
    default:
      return reason?.startsWith("workspace_")
        ? "This workspace is not active right now, so Compass is not available."
        : "Compass is not available right now.";
  }
}
