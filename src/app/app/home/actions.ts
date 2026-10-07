"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isLeadId } from "@/lib/cases/filters";
import { canApproveItem } from "@/lib/home/catalog";
import { loadGateState } from "@/lib/home/gate";
import { isDone, itemPreview, parseDrafts } from "@/lib/home/queue";
import { runApprovalItem } from "@/lib/home/run";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dbCanApprove } from "@/lib/auth/db-checks";
import type { Json } from "@/types/database";

export type QueueActionResult = { ok: true; message?: string } | { ok: false; error: string };

const MAX_BODY = 1600;
const MAX_SUBJECT = 200;
const MAX_REASON = 500;

function revalidateHome() {
  revalidatePath("/app/home");
  revalidatePath("/app/home/activity");
}

/**
 * Loads an item in the caller's workspace and checks the caller may decide
 * it under the workspace's current approval settings. Writes then go through
 * the service role, the same way follow-up approvals do.
 */
async function requireDecidableItem(itemId: string): Promise<
  | { ok: true; ctx: AuthContext; item: { id: string; status: string; action_type: string; drafts: Json } }
  | { ok: false; error: string }
> {
  if (!isLeadId(itemId)) return { ok: false, error: "That item is not in this workspace." };
  const ctx = await getAuthContext();
  const admin = getSupabaseAdmin();
  const { data: item } = await admin
    .from("approval_items")
    .select("id, status, action_type, drafts, assigned_member_id, escalated_at")
    .eq("id", itemId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!item) return { ok: false, error: "That item is not in this workspace." };
  const gate = await loadGateState(admin, ctx.org.id);
  const choice = gate.choice(item.action_type);
  if (choice.mode === "off") return { ok: false, error: "This action is turned off in approval settings." };
  const allowed =
    canApproveItem({
      approver: choice.approver,
      role: ctx.role,
      isStaff: ctx.isStaff,
      canApprove: ctx.member.canApprove,
      memberId: ctx.member.id,
      assignedMemberId: item.assigned_member_id,
      escalated: Boolean(item.escalated_at),
    }) && (await dbCanApprove(ctx.org.id));
  if (!allowed) return { ok: false, error: "You cannot approve this under this workspace's approval settings." };
  return { ok: true, ctx, item };
}

async function run(ctx: AuthContext, itemId: string): Promise<QueueActionResult> {
  const outcome = await runApprovalItem(getSupabaseAdmin(), {
    orgId: ctx.org.id,
    itemId,
    runMode: "approved",
    actor: { memberId: ctx.member.id, name: ctx.member.displayName },
    timeZone: ctx.org.timezone,
  });
  revalidateHome();
  if (!outcome.ok) return { ok: false, error: outcome.error };
  if (outcome.status === "failed") {
    return { ok: false, error: outcome.failureReason ?? "Some of this did not go out. It is still in the queue." };
  }
  return { ok: true, message: outcome.done === 1 ? "Done. 1 lead handled." : `Done. ${outcome.done} leads handled.` };
}

export async function approveQueueItem(itemId: string): Promise<QueueActionResult> {
  const scoped = await requireDecidableItem(itemId);
  if (!scoped.ok) return scoped;
  if (scoped.item.status !== "pending" && scoped.item.status !== "failed") {
    return { ok: false, error: "This is not waiting for approval." };
  }
  return run(scoped.ctx, itemId);
}

export async function retryQueueItem(itemId: string): Promise<QueueActionResult> {
  const scoped = await requireDecidableItem(itemId);
  if (!scoped.ok) return scoped;
  if (scoped.item.status !== "failed") return { ok: false, error: "Only a failed item can be retried." };
  return run(scoped.ctx, itemId);
}

export async function saveQueueItemDrafts(input: {
  itemId: string;
  drafts: Array<{ leadId: string; body: string; subject: string | null }>;
  approve: boolean;
}): Promise<QueueActionResult> {
  const scoped = await requireDecidableItem(input.itemId);
  if (!scoped.ok) return scoped;
  if (scoped.item.status !== "pending" && scoped.item.status !== "failed") {
    return { ok: false, error: "This can no longer be edited." };
  }
  const edits = new Map(input.drafts.map((draft) => [draft.leadId, draft]));
  const current = parseDrafts(scoped.item.drafts);
  const next = [];
  for (const draft of current) {
    const edit = edits.get(draft.leadId);
    if (!edit || isDone(draft)) {
      next.push(draft);
      continue;
    }
    const body = edit.body.trim();
    if (!body) return { ok: false, error: `The message to ${draft.leadName} is empty.` };
    if (body.length > MAX_BODY) return { ok: false, error: `Keep the message to ${draft.leadName} under ${MAX_BODY} characters.` };
    const subject = draft.channel === "email" ? (edit.subject ?? "").trim() : null;
    if (draft.channel === "email" && !subject) return { ok: false, error: `The email to ${draft.leadName} needs a subject.` };
    if (subject && subject.length > MAX_SUBJECT) return { ok: false, error: "Keep the subject short." };
    next.push({ ...draft, body, subject });
  }
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("approval_items")
    .update({ drafts: next as unknown as Json, preview: itemPreview(next) })
    .eq("id", input.itemId)
    .eq("org_id", scoped.ctx.org.id)
    .in("status", ["pending", "failed"]);
  if (error) return { ok: false, error: "Could not save those edits." };
  if (input.approve) return run(scoped.ctx, input.itemId);
  revalidateHome();
  return { ok: true, message: "Saved." };
}

export async function dismissQueueItem(input: { itemId: string; reason: string }): Promise<QueueActionResult> {
  const scoped = await requireDecidableItem(input.itemId);
  if (!scoped.ok) return scoped;
  if (scoped.item.status !== "pending" && scoped.item.status !== "failed") {
    return { ok: false, error: "This is no longer in the queue." };
  }
  const reason = input.reason.trim();
  if (reason.length > MAX_REASON) return { ok: false, error: `Keep the reason under ${MAX_REASON} characters.` };
  const { data, error } = await getSupabaseAdmin()
    .from("approval_items")
    .update({
      status: "dismissed",
      dismiss_reason: reason || null,
      decided_by_member_id: scoped.ctx.member.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.itemId)
    .eq("org_id", scoped.ctx.org.id)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not dismiss that." };
  revalidateHome();
  return { ok: true, message: "Dismissed." };
}
