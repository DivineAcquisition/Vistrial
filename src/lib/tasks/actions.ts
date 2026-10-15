"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { createClient } from "@/lib/supabase/server";
import {
  dueChoice,
  initialStatus,
  purposeKey,
  sourceSentence,
  taskReminderCopy,
  type TaskSource,
  type TaskType,
} from "@/lib/tasks/model";
import type { SupabaseClient } from "@supabase/supabase-js";

type Loose = SupabaseClient;

export type TaskActionResult = { ok: true } | { ok: false; error: string };

function db(): Promise<Loose> {
  return createClient().then((client) => client as unknown as Loose);
}

async function agentMode(client: Loose, orgId: string): Promise<"suggested" | "direct"> {
  const { data } = await client.from("routing_settings").select("agent_tasks").eq("org_id", orgId).maybeSingle();
  const value = (data as { agent_tasks?: string } | null)?.agent_tasks;
  return value === "direct" ? "direct" : "suggested";
}

export async function createTask(input: {
  title: string;
  leadId?: string | null;
  dueChoice?: "later_today" | "tomorrow_morning" | "in_3_days";
  dueAt?: string | null;
  type?: TaskType;
  source?: TaskSource;
  purpose?: string;
  because?: string;
  assigneeId?: string | null;
}): Promise<TaskActionResult> {
  const ctx = await getAuthContext();
  const title = input.title.trim();
  if (title.length < 3) return { ok: false, error: "Write a short title." };
  if (title.length > 240) return { ok: false, error: "Keep the title under 240 characters." };
  const source = input.source ?? "person";
  const purpose = input.purpose?.trim() || title;
  const key = purposeKey(source, purpose);
  const client = await db();
  const mode = await agentMode(client, ctx.org.id);
  const status = initialStatus(source, mode);
  const due = input.dueAt
    ? new Date(input.dueAt)
    : input.dueChoice
      ? dueChoice(input.dueChoice, new Date())
      : null;

  if (input.leadId) {
    const { data: existing } = await client
      .from("next_actions")
      .select("id, action_text")
      .eq("org_id", ctx.org.id)
      .eq("lead_id", input.leadId)
      .eq("purpose_key", key)
      .in("status", ["suggested", "open", "snoozed"])
      .maybeSingle();
    if (existing && (existing as { id: string }).id) {
      await client
        .from("next_actions")
        .update({
          action_text: title,
          source_sentence: sourceSentence(source, input.because ?? "updated"),
          due_at: due ? due.toISOString() : null,
        })
        .eq("id", (existing as { id: string }).id);
      revalidatePath("/app/tasks");
      revalidatePath("/app/today");
      return { ok: true };
    }
  }

  const { error } = await client.from("next_actions").insert({
    org_id: ctx.org.id,
    lead_id: input.leadId || null,
    action_text: title,
    owner_member_id: input.assigneeId || ctx.member.id,
    due_at: due ? due.toISOString() : null,
    created_by: source === "person" ? "user" : "system",
    task_type: input.type ?? "other",
    status,
    source_kind: source,
    source_sentence: sourceSentence(source, input.because ?? ""),
    purpose_key: key,
  });
  if (error) return { ok: false, error: "Could not save that task." };

  if (status === "suggested") {
    const copy = taskReminderCopy("suggested");
    await enqueueNotification(await createClient(), {
      orgId: ctx.org.id,
      eventType: "task_suggested",
      channel: "push",
      recipientUserId: ctx.user.id,
      recipientMemberId: ctx.member.id,
      subjectKind: "task",
      subjectIds: [],
      title: copy.title,
      body: copy.body,
      href: "/app/tasks",
      dedupeKey: `task-suggested:${ctx.org.id}:${ctx.member.id}:${key}`,
    }).catch(() => undefined);
  }
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: true };
}

export async function setTaskStatus(input: {
  id: string;
  status: "open" | "done" | "canceled" | "snoozed";
  snooze?: "later_today" | "tomorrow_morning" | "in_3_days";
  reason?: string;
}): Promise<TaskActionResult> {
  const ctx = await getAuthContext();
  const client = await db();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "snoozed") {
    const due = dueChoice(input.snooze ?? "tomorrow_morning", new Date());
    patch.snoozed_until = due.toISOString();
    patch.due_at = due.toISOString();
  }
  if (input.status === "open") patch.accepted_at = new Date().toISOString();
  if (input.status === "canceled") patch.cancel_reason = (input.reason ?? "Canceled").slice(0, 200);
  const { error } = await client.from("next_actions").update(patch).eq("org_id", ctx.org.id).eq("id", input.id);
  if (error) return { ok: false, error: "Could not update that task." };
  if (input.status === "done" || input.status === "canceled") {
    await client
      .from("notifications")
      .update({ status: "cancelled" })
      .eq("org_id", ctx.org.id)
      .eq("status", "queued")
      .contains("subject_ids", [input.id]);
  }
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: true };
}
