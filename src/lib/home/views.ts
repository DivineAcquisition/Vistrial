import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import {
  APPROVER_LABELS,
  canApproveItem,
  queueKind,
  whoCanApprove,
} from "@/lib/home/catalog";
import { loadGateState } from "@/lib/home/gate";
import {
  groupActivity,
  parseDrafts,
  QUEUE_OPEN_STATUSES,
  sortQueue,
  type ActivityEntry,
  type ActivityEvent,
  type QueueDraft,
} from "@/lib/home/queue";
import { mapWaiting, OPEN_REQUEST_STATUSES, type WaitingItem } from "@/lib/live/model";
import { createClient } from "@/lib/supabase/server";

export type QueueItemView = {
  id: string;
  kind: string;
  kindLabel: string;
  actionType: string;
  title: string;
  preview: string | null;
  reason: string | null;
  status: "pending" | "running" | "failed";
  failureReason: string | null;
  createdAt: string;
  escalatedAt: string | null;
  drafts: QueueDraft[];
  canApprove: boolean;
  /** Shown instead of the buttons when this person cannot approve. */
  whoCanApprove: string;
  approverLabel: string;
  assignedName: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Agent requests waiting on a person, including approved messages that still
 * need sending from the CRM. These are decided through the shared request
 * card, never the queue's own run path.
 */
export async function loadAgentRequests(ctx: AuthContext): Promise<WaitingItem[]> {
  const db = (await createClient()) as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data } = await db
    .from("approval_items")
    .select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at")
    .eq("org_id", ctx.org.id)
    .not("agent_id", "is", null)
    .in("status", [...OPEN_REQUEST_STATUSES])
    .order("created_at", { ascending: true })
    .limit(50);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapWaiting);
}

/**
 * The approval queue as this person sees it. Row-level security already
 * limits setters and closers to items assigned to them; the gate settings
 * decide who may press approve.
 */
export async function loadApprovalQueue(ctx: AuthContext): Promise<QueueItemView[]> {
  const db = await createClient();
  const [gate, { data: items }, { data: members }] = await Promise.all([
    loadGateState(db, ctx.org.id),
    db
      .from("approval_items")
      .select("id, kind, action_type, title, preview, reason, status, failure_reason, created_at, escalated_at, drafts, assigned_member_id")
      .eq("org_id", ctx.org.id)
      .in("status", [...QUEUE_OPEN_STATUSES])
      .is("agent_id", null)
      .order("created_at", { ascending: true })
      .limit(200),
    db.from("org_members").select("id, display_name").eq("org_id", ctx.org.id),
  ]);
  const names = new Map((members ?? []).map((member) => [member.id, member.display_name]));

  const views: QueueItemView[] = [];
  for (const item of items ?? []) {
    const choice = gate.choice(item.action_type);
    // Turned off since it was drafted. The next sweep dismisses it.
    if (choice.mode === "off" && item.status === "pending") continue;
    const escalated = Boolean(item.escalated_at);
    views.push({
      id: item.id,
      kind: item.kind,
      kindLabel: queueKind(item.kind)?.label ?? "Task",
      actionType: item.action_type,
      title: item.title,
      preview: item.preview,
      reason: item.reason,
      status: item.status as QueueItemView["status"],
      failureReason: item.failure_reason,
      createdAt: item.created_at,
      escalatedAt: item.escalated_at,
      drafts: parseDrafts(item.drafts),
      canApprove: canApproveItem({
        approver: choice.approver,
        role: ctx.role,
        isStaff: ctx.isStaff,
        canApprove: ctx.member.canApprove,
        memberId: ctx.member.id,
        assignedMemberId: item.assigned_member_id,
        escalated,
      }),
      whoCanApprove: whoCanApprove(choice.approver, escalated),
      approverLabel: APPROVER_LABELS[choice.approver],
      assignedName: item.assigned_member_id ? (names.get(item.assigned_member_id) ?? null) : null,
    });
  }
  return sortQueue(views);
}

function toEvent(row: { id: string; action_taken: string | null; occurred_at: string; output: unknown }): ActivityEvent | null {
  if (!row.action_taken) return null;
  const output = asRecord(row.output);
  const runMode = output.runMode === "approved" ? "approved" : output.runMode === "auto_run" ? "auto_run" : null;
  if (!runMode) return null;
  const leadIds = Array.isArray(output.leadIds) ? output.leadIds.filter((id): id is string => typeof id === "string") : [];
  return {
    id: row.id,
    actionType: row.action_taken,
    occurredAt: row.occurred_at,
    runMode,
    approvedByMemberId: typeof output.approvedByMemberId === "string" ? output.approvedByMemberId : null,
    approvedByName: typeof output.approvedByName === "string" ? output.approvedByName : null,
    count: typeof output.count === "number" && output.count > 0 ? output.count : Math.max(1, leadIds.length),
    leadIds,
  };
}

/**
 * What Vistrial did on its own or after an approval, newest first and
 * grouped. Setters and closers see their own: what they approved and what
 * was done on leads assigned to them.
 */
export async function loadActivity(ctx: AuthContext, limit: number): Promise<{ entries: ActivityEntry[]; more: boolean }> {
  const db = await createClient();
  const { data } = await db
    .from("agent_events")
    .select("id, action_taken, occurred_at, output")
    .eq("org_id", ctx.org.id)
    .eq("actor", "vistrial")
    .order("occurred_at", { ascending: false })
    .limit(Math.max(limit * 20, 200));
  const managerView = ctx.isStaff || ctx.role === "owner" || ctx.role === "admin";
  const events = (data ?? [])
    .filter((row) => {
      if (managerView) return true;
      const output = asRecord(row.output);
      return output.approvedByMemberId === ctx.member.id || output.assignedMemberId === ctx.member.id;
    })
    .map(toEvent)
    .filter((event): event is ActivityEvent => event !== null);
  const entries = groupActivity(events);
  return { entries: entries.slice(0, limit), more: entries.length > limit };
}
