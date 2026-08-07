import "server-only";

import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Json, TeamActivityAction } from "@/types/database";

/** Append-only. No role may update or delete an entry. */
export async function appendActivity(
  db: LedgerDb,
  entry: {
    actorTeamUserId?: string | null;
    actorEmail?: string | null;
    action: TeamActivityAction;
    subjectTeamUserId?: string | null;
    detail?: Json;
    ipAddress?: string | null;
  }
): Promise<void> {
  const { error } = await db.from("team_activity_log").insert({
    actor_team_user_id: entry.actorTeamUserId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    subject_team_user_id: entry.subjectTeamUserId ?? null,
    detail: entry.detail ?? {},
    ip_address: entry.ipAddress ?? null,
  });

  if (error) {
    // Logging must not break the action that produced the event.
    console.error("team_activity_log insert failed:", error.message);
  }
}
