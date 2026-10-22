"use server";

import { revalidatePath } from "next/cache";

import { actorFrom, loadSalesCalendar, salesCalendarEnabled } from "@/lib/calendar/load";
import { scopeRepId, taskTitle, type CalendarFilters, type CalendarPayload } from "@/lib/calendar/model";
import { getAuthContext } from "@/lib/auth/session";
import { createTask } from "@/lib/tasks/actions";
import type { TaskType } from "@/lib/tasks/model";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CalendarActionResult = { ok: true } | { ok: false; error: string };

const TASK_TYPES = new Set<TaskType>(["call", "follow_up", "prepare", "review", "other"]);

/** Range load for the calendar. Returns nothing when the flag is off. */
export async function loadCalendarRange(input: {
  start: string;
  end: string;
  filters?: Partial<CalendarFilters> | null;
}): Promise<{ ok: true; data: CalendarPayload } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const data = await loadSalesCalendar(ctx, input);
  if (!data) return { ok: false, error: "Calendar is off for this workspace." };
  return { ok: true, data };
}

/**
 * A task from an empty slot. Uses the existing task path. The title is the
 * task kind, never text typed into the calendar.
 */
export async function createCalendarTask(input: { type: TaskType; dueAt: string }): Promise<CalendarActionResult> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  if (!(await salesCalendarEnabled(db, ctx.org.id))) return { ok: false, error: "Calendar is off for this workspace." };
  if (!TASK_TYPES.has(input.type)) return { ok: false, error: "Choose a task kind." };
  const due = new Date(input.dueAt);
  if (Number.isNaN(due.getTime())) return { ok: false, error: "That time is not valid." };
  const result = await createTask({
    title: taskTitle(input.type),
    type: input.type,
    dueAt: due.toISOString(),
    source: "person",
    purpose: `calendar ${input.type} ${due.toISOString()}`,
  });
  if (!result.ok) return result;
  revalidatePath("/app/calendar");
  return { ok: true };
}

/** A team hold on this workspace's own calendar. It does not message a lead. */
export async function createCalendarHold(input: { start: string; end: string; memberId?: string | null }): Promise<CalendarActionResult> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  if (!(await salesCalendarEnabled(db, ctx.org.id))) return { ok: false, error: "Calendar is off for this workspace." };
  const start = new Date(input.start);
  let end = new Date(input.end);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "That time is not valid." };
  if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60_000);
  if (end.getTime() - start.getTime() > 8 * 3_600_000) return { ok: false, error: "A hold can cover at most 8 hours." };
  const memberId = scopeRepId(actorFrom(ctx), input.memberId ?? ctx.member.id) ?? ctx.member.id;
  const { error } = await db.from("calendar_blocks").insert({
    org_id: ctx.org.id,
    source: "person",
    kind: "hold",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    member_id: memberId,
    external_id: `hold:${crypto.randomUUID()}`,
  });
  if (error) return { ok: false, error: "Could not save that hold." };
  revalidatePath("/app/calendar");
  return { ok: true };
}

/** Vistrial staff switch the calendar on or off for one workspace. */
export async function setSalesCalendarFlag(on: boolean): Promise<CalendarActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can change this switch." };
  const db = (await createClient()) as unknown as { rpc: (fn: string, args: object) => Promise<{ error: { message: string } | null }> };
  const { error } = await db.rpc("set_workspace_flag", { p_org_id: ctx.org.id, p_flag: "sales_calendar", p_enabled: on });
  if (error) return { ok: false, error: "Could not change that. Try again." };
  revalidatePath("/app", "layout");
  revalidatePath("/app/calendar");
  return { ok: true };
}
