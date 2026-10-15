import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { taskReminderCopy } from "@/lib/tasks/model";

/** One generic reminder per open task that is due. Cancelled tasks are skipped. */
export async function remindDueTasks(db: GhlDb): Promise<{ reminded: number }> {
  const now = new Date().toISOString();
  const { data } = await db
    .from("next_actions")
    .select("id, org_id, owner_member_id, status")
    .in("status", ["open", "snoozed"])
    .is("reminded_at", null)
    .lte("due_at", now)
    .limit(50);
  let reminded = 0;
  for (const row of (data ?? []) as Array<{ id: string; org_id: string; owner_member_id: string | null }>) {
    if (!row.owner_member_id) continue;
    const { data: member } = await db.from("org_members").select("user_id").eq("id", row.owner_member_id).maybeSingle();
    if (!member?.user_id) continue;
    const copy = taskReminderCopy("due");
    await enqueueNotification(db, {
      orgId: row.org_id,
      eventType: "task_due",
      channel: "push",
      recipientUserId: member.user_id,
      recipientMemberId: row.owner_member_id,
      subjectKind: "task",
      subjectIds: [row.id],
      title: copy.title,
      body: copy.body,
      href: "/app/tasks",
      dedupeKey: `task-due:${row.id}`,
    }).catch(() => undefined);
    await db.from("next_actions").update({ reminded_at: now }).eq("id", row.id);
    reminded += 1;
  }
  return { reminded };
}
