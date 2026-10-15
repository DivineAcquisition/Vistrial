import type { SupabaseClient } from "@supabase/supabase-js";

import { BILLING_EMAILS } from "@/lib/billing/copy";
import { queuePortalNotice } from "@/lib/portal/notices";

type Notice = { org_id: string; kind: string; period_key: string };
type Warning = { org_id: string; meter: string; percent: number };

const COPY: Record<string, { title: string; body: string }> = {
  grace_reminder: { title: BILLING_EMAILS.grace_reminder.subject, body: BILLING_EMAILS.grace_reminder.body },
  restricted: { title: BILLING_EMAILS.restricted.subject, body: BILLING_EMAILS.restricted.body },
  suspended: { title: BILLING_EMAILS.suspended.subject, body: BILLING_EMAILS.suspended.body },
  pilot_ending: { title: BILLING_EMAILS.pilot_ending.subject, body: BILLING_EMAILS.pilot_ending.body },
};

/**
 * Move past-due workspaces along the approved timeline and queue one notice
 * per stage. Safety work (opt-out, quiet hours, export, cancellation) is not touched.
 */
export async function runBillingCron(db: SupabaseClient): Promise<{ advanced: number; notices: number; warnings: number }> {
  const { data: advanced, error } = await db.rpc("billing_advance");
  if (error) throw new Error(error.message);
  const { data: due, error: dueError } = await db.rpc("billing_due_notices");
  if (dueError) throw new Error(dueError.message);
  const { data: warnings, error: warnError } = await db.rpc("billing_usage_warnings");
  if (warnError) throw new Error(warnError.message);

  let notices = 0;
  for (const row of (due ?? []) as Notice[]) {
    const copy = COPY[row.kind];
    if (!copy) continue;
    const { data: owners } = await db.from("org_members").select("id").eq("org_id", row.org_id).eq("role", "owner").eq("active", true);
    for (const owner of owners ?? []) {
      await queuePortalNotice({
        orgId: row.org_id,
        memberId: owner.id,
        eventType: "billing_issue",
        title: copy.title,
        body: copy.body,
        path: "/app/settings/billing",
        dedupeKey: `billing:${row.kind}:${row.org_id}:${row.period_key}`,
      });
      notices += 1;
    }
  }
  for (const row of (warnings ?? []) as Warning[]) {
    const copy = row.percent >= 100 ? BILLING_EMAILS.usage_100 : BILLING_EMAILS.usage_80;
    const { data: owners } = await db.from("org_members").select("id").eq("org_id", row.org_id).eq("role", "owner").eq("active", true);
    for (const owner of owners ?? []) {
      await queuePortalNotice({
        orgId: row.org_id,
        memberId: owner.id,
        eventType: "billing_issue",
        title: copy.subject,
        body: copy.body,
        path: "/app/settings/billing",
        dedupeKey: `billing:usage:${row.percent}:${row.org_id}:${row.meter}`,
      });
      notices += 1;
    }
  }
  return { advanced: Number(advanced ?? 0), notices, warnings: ((warnings ?? []) as Warning[]).length };
}
