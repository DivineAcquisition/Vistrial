"use server";

import { revalidatePath } from "next/cache";

import { canAssignLeadTo } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { QueueCursor } from "@/lib/queue/cursor";
import { fetchOrgQueue, fetchQueueRow } from "@/lib/queue/load";
import {
  QUEUE_PAGE_SIZE,
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_OUTCOMES,
  type QueueActionResult,
  type QueueFilters,
  type QueuePayload,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { createClient } from "@/lib/supabase/server";

function isChannel(value: string): value is TouchChannel {
  return (TOUCH_CHANNELS as readonly string[]).includes(value);
}

function isDirection(value: string): value is TouchDirection {
  return (TOUCH_DIRECTIONS as readonly string[]).includes(value);
}

function isOutcome(value: string): value is TouchOutcome {
  return (TOUCH_OUTCOMES as readonly string[]).includes(value);
}

function actionError(error: string): QueueActionResult {
  return { ok: false, error };
}

function explainWriteError(message: string | undefined, fallback: string): string {
  const text = message ?? "";
  if (text.toLowerCase().includes("not authorized to reassign")) {
    return "You can assign this lead to yourself, but not to someone else.";
  }
  if (text.toLowerCase().includes("row-level security") || text.toLowerCase().includes("42501")) {
    return "You do not have permission to do that.";
  }
  return fallback;
}

export async function refreshQueue(
  filters: QueueFilters,
  opts?: { cursor?: QueueCursor | null; limit?: number }
): Promise<QueuePayload> {
  return fetchOrgQueue(
    await createClient(),
    (await getAuthContext()).org.id,
    filters,
    { cursor: opts?.cursor ?? null, limit: opts?.limit ?? QUEUE_PAGE_SIZE }
  );
}

export async function logQueueOutcome(input: {
  leadId: string;
  channel: string;
  direction: string;
  outcome: string;
  note?: string;
  actorMemberId?: string;
}): Promise<QueueActionResult> {
  const ctx = await getAuthContext();
  if (!isChannel(input.channel)) return actionError("Pick a channel.");
  if (!isDirection(input.direction)) return actionError("Pick inbound or outbound.");
  if (!isOutcome(input.outcome)) return actionError("Pick an outcome.");

  const note = input.note?.trim() ?? "";
  if (note.length > 280) return actionError("Keep the note under 280 characters.");

  const actorMemberId = input.actorMemberId?.trim() || ctx.member.id;
  if (actorMemberId !== ctx.member.id && !canAssignLeadTo({
    role: ctx.role,
    actorMemberId: ctx.member.id,
    targetMemberId: actorMemberId,
    isPlatformAdmin: ctx.isPlatformAdmin,
  })) {
    return actionError("Only an owner or admin can log an outcome as someone else.");
  }

  const supabase = await createClient();
  const { data: actor, error: actorError } = await supabase
    .from("org_members")
    .select("id, active")
    .eq("org_id", ctx.org.id)
    .eq("id", actorMemberId)
    .maybeSingle();

  if (actorError || !actor || !actor.active) {
    return actionError("That teammate is not an active member of this workspace.");
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError || !lead) return actionError("That lead is not in this workspace.");

  const { error } = await supabase.from("touches").insert({
    org_id: ctx.org.id,
    lead_id: input.leadId,
    type: "human",
    channel: input.channel,
    direction: input.direction,
    outcome: input.outcome,
    actor_member_id: actorMemberId,
    summary: note || null,
  });

  if (error) {
    return actionError(explainWriteError(error.message, "Could not log that outcome."));
  }

  revalidatePath("/app/queue");
  const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
  return { ok: true, row };
}

export async function assignQueueLead(input: {
  leadId: string;
  setterId: string | null;
  closerId: string | null;
}): Promise<QueueActionResult> {
  const ctx = await getAuthContext();
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_setter_id, assigned_closer_id")
    .eq("org_id", ctx.org.id)
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError || !lead) return actionError("That lead is not in this workspace.");

  const { data: members, error: memberError } = await supabase
    .from("org_members")
    .select("id, active")
    .eq("org_id", ctx.org.id)
    .eq("active", true);

  if (memberError) return actionError("Could not verify org membership.");
  const activeIds = new Set((members ?? []).map((member) => member.id));

  const setterId = input.setterId || null;
  const closerId = input.closerId || null;

  if (setterId && !activeIds.has(setterId)) {
    return actionError("The setter must be an active member of this workspace.");
  }
  if (closerId && !activeIds.has(closerId)) {
    return actionError("The closer must be an active member of this workspace.");
  }

  if (setterId !== lead.assigned_setter_id) {
    const allowed = canAssignLeadTo({
      role: ctx.role,
      actorMemberId: ctx.member.id,
      targetMemberId: setterId,
      isPlatformAdmin: ctx.isPlatformAdmin,
    });
    if (!allowed) {
      return actionError("You can assign this lead to yourself, but not to someone else.");
    }
  }
  if (closerId !== lead.assigned_closer_id) {
    const allowed = canAssignLeadTo({
      role: ctx.role,
      actorMemberId: ctx.member.id,
      targetMemberId: closerId,
      isPlatformAdmin: ctx.isPlatformAdmin,
    });
    if (!allowed) {
      return actionError("You can assign this lead to yourself, but not to someone else.");
    }
  }

  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      assigned_setter_id: setterId,
      assigned_closer_id: closerId,
    })
    .eq("org_id", ctx.org.id)
    .eq("id", input.leadId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not update assignment."));
  }
  if (!updated) {
    return actionError("You can assign this lead to yourself, but not to someone else.");
  }

  revalidatePath("/app/queue");
  const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
  return { ok: true, row };
}

export async function completeQueueNextAction(input: {
  leadId: string;
  nextActionId: string;
}): Promise<QueueActionResult> {
  const ctx = await getAuthContext();
  const supabase = await createClient();

  const { data: action, error: loadError } = await supabase
    .from("next_actions")
    .select("id, lead_id, completed_at")
    .eq("org_id", ctx.org.id)
    .eq("id", input.nextActionId)
    .eq("lead_id", input.leadId)
    .maybeSingle();

  if (loadError || !action) return actionError("That next action is not on this lead.");
  if (action.completed_at) {
    const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
    return { ok: true, row };
  }

  const { data: updated, error } = await supabase
    .from("next_actions")
    .update({ completed_at: new Date().toISOString() })
    .eq("org_id", ctx.org.id)
    .eq("id", input.nextActionId)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not complete that next action."));
  }
  if (!updated) return actionError("Could not complete that next action.");

  revalidatePath("/app/queue");
  const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
  return { ok: true, row };
}

export async function createQueueFollowOn(input: {
  leadId: string;
  actionText: string;
  dueAt?: string | null;
}): Promise<QueueActionResult> {
  const ctx = await getAuthContext();
  const actionText = input.actionText.trim();
  if (!actionText) return actionError("Write the follow-on before saving it.");
  if (actionText.length > 240) return actionError("Keep the follow-on under 240 characters.");

  let dueAt: string | null = input.dueAt?.trim() || null;
  if (dueAt) {
    const parsed = Date.parse(dueAt);
    if (!Number.isFinite(parsed)) return actionError("That due time is not usable.");
    dueAt = new Date(parsed).toISOString();
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError || !lead) return actionError("That lead is not in this workspace.");

  const { error } = await supabase.from("next_actions").insert({
    org_id: ctx.org.id,
    lead_id: input.leadId,
    action_text: actionText,
    due_at: dueAt,
    owner_member_id: ctx.member.id,
    created_by: "user",
  });

  if (error) {
    return actionError(explainWriteError(error.message, "Could not save the follow-on."));
  }

  revalidatePath("/app/queue");
  const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
  return { ok: true, row };
}
