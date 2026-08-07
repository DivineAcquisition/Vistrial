import "server-only";

import { listActiveOwners, updateTeamUser } from "@/lib/db/team";
import { appendActivity } from "@/lib/team/activity";
import { sendEmail } from "@/lib/notifications/email";
import { createServiceClient } from "@/lib/supabase/server";
import type { TeamUser } from "@/types/database";

async function maxFailures(): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "team_max_failed_sign_ins")
    .maybeSingle();
  const raw = data?.value;
  const n = Number(typeof raw === "string" ? raw.replaceAll('"', "") : raw);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

export async function recordFailedSignIn(
  team: TeamUser,
  ipAddress: string | null
): Promise<{ locked: boolean }> {
  const db = createServiceClient();
  const next = team.failed_sign_in_count + 1;
  const limit = await maxFailures();

  await appendActivity(db, {
    actorEmail: team.email,
    action: "sign_in_failed",
    subjectTeamUserId: team.id,
    ipAddress,
    detail: { attempt: next },
  });

  if (next >= limit) {
    await updateTeamUser(team.id, {
      failed_sign_in_count: next,
      status: "locked",
      locked_at: new Date().toISOString(),
    });
    await appendActivity(db, {
      actorEmail: team.email,
      action: "account_locked",
      subjectTeamUserId: team.id,
      ipAddress,
      detail: { failures: next },
    });

    const owners = await listActiveOwners();
    await Promise.all(
      owners.map((owner) =>
        sendEmail(
          owner.email,
          `Team account locked — ${team.email}`,
          [
            `${team.email} has been locked after ${next} consecutive failed sign-in attempts.`,
            "An Owner can unlock the account from Team users.",
            ipAddress ? `Originating address: ${ipAddress}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
      )
    );

    return { locked: true };
  }

  await updateTeamUser(team.id, { failed_sign_in_count: next });
  return { locked: false };
}

export async function clearFailedSignIns(teamId: string): Promise<void> {
  await updateTeamUser(teamId, {
    failed_sign_in_count: 0,
    locked_at: null,
  });
}
