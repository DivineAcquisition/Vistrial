import "server-only";

import { appUrl } from "@/lib/app-url";
import { CONFIG_CONSUMERS } from "@/lib/config/consumers";
import type { GhlDb } from "@/lib/ghl/tokens";
import { sendEmail } from "@/lib/notifications/senders";

/**
 * Tell the Service Team about each agent that stopped for missing or invalid
 * settings since the last run: the people assigned to that workspace, or the
 * Platform Admins when nobody is. Once per stop; the stop stays open on the
 * workspace's configuration screen until the agent next runs cleanly.
 */
export async function alertNewConfigStops(db: GhlDb): Promise<{ alerted: number }> {
  const { data: stops } = await db
    .from("config_stops")
    .select("id, org_id, consumer")
    .is("notified_at", null)
    .is("resolved_at", null)
    .limit(50);

  let alerted = 0;
  for (const stop of stops ?? []) {
    const [{ data: org }, { data: assigned }] = await Promise.all([
      db.from("organizations").select("name").eq("id", stop.org_id).maybeSingle(),
      db.from("workspace_assignments").select("user_id").eq("org_id", stop.org_id).is("ended_at", null),
    ]);
    const assignedIds = (assigned ?? []).map((row) => row.user_id);
    const staffQuery = db.from("platform_staff").select("email").eq("active", true);
    const { data: staff } = await (assignedIds.length > 0
      ? staffQuery.in("user_id", assignedIds)
      : staffQuery.eq("role", "platform_admin"));

    const label = CONFIG_CONSUMERS[stop.consumer as keyof typeof CONFIG_CONSUMERS]?.label ?? "An agent";
    const title = `${label} stopped for ${org?.name ?? "a workspace"}`;
    const body = "A setting it needs is missing or invalid, so it did nothing rather than guess. Open the workspace configuration to fix it.";
    const href = `${appUrl()}/app/settings/configuration?workspace=${stop.org_id}`;
    await Promise.all(
      (staff ?? []).map((person) =>
        sendEmail({ to: person.email, title, body, href, notificationId: stop.id, eventType: "config.stopped" }).catch(() => null)
      )
    );
    await db.from("config_stops").update({ notified_at: new Date().toISOString() }).eq("id", stop.id);
    alerted += 1;
  }
  return { alerted };
}
