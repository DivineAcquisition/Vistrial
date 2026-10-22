import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessHours, RoleTargets } from "@/lib/foundation/fields";
import { confirmedFoundation } from "@/lib/foundation/store";
import { dayWindow, eodActivity, emptyActivity, localDay, type ActivityRows, type EodActivity } from "@/lib/manager/eod";
import { coachingMoments, scorecard, sumActivity, type CoachingMoment, type Metric, type RepRole } from "@/lib/manager/scorecard";

export type Rep = { memberId: string; name: string; role: RepRole; userId: string | null };

export type EodReport = {
  id: string;
  memberId: string;
  day: string;
  status: "drafted" | "confirmed";
  activity: EodActivity;
  repNote: string | null;
  confirmedAt: string | null;
};

const DAY = 86_400_000;

export async function teamReps(db: SupabaseClient, orgId: string): Promise<Rep[]> {
  const { data } = await db
    .from("org_members")
    .select("id, display_name, role, user_id")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", ["setter", "closer", "operator"]);
  return ((data ?? []) as Array<{ id: string; display_name: string | null; role: string; user_id: string | null }>)
    .map((row) => ({ memberId: row.id, name: row.display_name?.trim() || "Teammate", role: (row.role === "closer" ? "closer" : "setter") as RepRole, userId: row.user_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadActivityRows(db: SupabaseClient, orgId: string, window: { start: string; end: string }, memberIds: string[]): Promise<ActivityRows> {
  if (memberIds.length === 0) return { touches: [], calls: [], statusChanges: [], tasksDone: [] };
  const [touches, calls, changes, tasks] = await Promise.all([
    db
      .from("touches")
      .select("actor_member_id, channel, direction, type, outcome, occurred_at")
      .eq("org_id", orgId)
      .in("actor_member_id", memberIds)
      .gte("occurred_at", window.start)
      .lt("occurred_at", window.end)
      .limit(20000),
    db
      .from("calls")
      .select("ran_by_member_id, outcome, occurred_at")
      .eq("org_id", orgId)
      .in("ran_by_member_id", memberIds)
      .gte("occurred_at", window.start)
      .lt("occurred_at", window.end)
      .limit(5000),
    db
      .from("lead_status_changes")
      .select("actor_member_id, to_status, created_at")
      .eq("org_id", orgId)
      .in("actor_member_id", memberIds)
      .gte("created_at", window.start)
      .lt("created_at", window.end)
      .limit(5000),
    db
      .from("next_actions")
      .select("owner_member_id, completed_at")
      .eq("org_id", orgId)
      .in("owner_member_id", memberIds)
      .gte("completed_at", window.start)
      .lt("completed_at", window.end)
      .limit(5000),
  ]);
  return {
    touches: (touches.data ?? []) as ActivityRows["touches"],
    calls: (calls.data ?? []) as ActivityRows["calls"],
    statusChanges: (changes.data ?? []) as ActivityRows["statusChanges"],
    tasksDone: (tasks.data ?? []) as ActivityRows["tasksDone"],
  };
}

/** Drafts (or refreshes) every rep's report for one local day. Confirmed reports are never touched. */
export async function draftEods(db: SupabaseClient, orgId: string, day: string, timeZone: string): Promise<number> {
  const reps = await teamReps(db, orgId);
  if (reps.length === 0) return 0;
  const window = dayWindow(day, timeZone);
  const ids = reps.map((rep) => rep.memberId);
  const activity = eodActivity(await loadActivityRows(db, orgId, window, ids), ids, window);
  const reports = ids.map((id) => ({ member_id: id, activity: activity.get(id) ?? emptyActivity() }));
  const { data, error } = await db.rpc("eod_save_drafts", { p_org_id: orgId, p_day: day, p_reports: reports });
  if (error) throw new Error("eod_draft_failed");
  return Number(data ?? 0);
}

function parseReport(row: Record<string, unknown>): EodReport {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    day: String(row.day),
    status: row.status === "confirmed" ? "confirmed" : "drafted",
    activity: { ...emptyActivity(), ...((row.activity as Partial<EodActivity>) ?? {}) },
    repNote: (row.rep_note as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
  };
}

/** Row-level security returns only this person's own reports unless they are a manager. */
export async function loadEods(db: SupabaseClient, orgId: string, opts: { memberId?: string; since: string; status?: "drafted" | "confirmed" }): Promise<EodReport[]> {
  let query = db
    .from("eod_reports")
    .select("id, member_id, day, status, activity, rep_note, confirmed_at")
    .eq("org_id", orgId)
    .gte("day", opts.since)
    .order("day", { ascending: false })
    .limit(400);
  if (opts.memberId) query = query.eq("member_id", opts.memberId);
  if (opts.status) query = query.eq("status", opts.status);
  const { data } = await query;
  return ((data ?? []) as Array<Record<string, unknown>>).map(parseReport);
}

export type RepScorecard = { rep: Rep; metrics: Metric[]; coaching: CoachingMoment[]; periodDays: number };

/** One rep's scorecard over the last `periodDays`, against confirmed Foundation targets. */
export async function loadScorecard(db: SupabaseClient, orgId: string, rep: Rep, periodDays: number, timeZone: string, now: number = Date.now()): Promise<RepScorecard> {
  const window = { start: dayWindow(localDay(now - (periodDays - 1) * DAY, timeZone), timeZone).start, end: new Date(now).toISOString() };
  const [rows, foundation, leads, actions, quality] = await Promise.all([
    loadActivityRows(db, orgId, window, [rep.memberId]),
    confirmedFoundation(db, orgId),
    db
      .from("leads")
      .select("time_to_first_human_touch_seconds")
      .eq("org_id", orgId)
      .eq(rep.role === "closer" ? "assigned_closer_id" : "assigned_setter_id", rep.memberId)
      .gte("opted_in_at", window.start)
      .not("time_to_first_human_touch_seconds", "is", null)
      .limit(2000),
    db.from("next_actions").select("due_at, completed_at").eq("org_id", orgId).eq("owner_member_id", rep.memberId).gte("due_at", window.start).lte("due_at", window.end).limit(2000),
    db
      .from("call_quality_measures")
      .select("call_id, lead_id, occurred_at, talk_ratio_rep, open_question_count, question_count")
      .eq("org_id", orgId)
      .eq("member_id", rep.memberId)
      .gte("occurred_at", window.start)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);
  const activity = sumActivity([eodActivity(rows, [rep.memberId], window).get(rep.memberId) ?? emptyActivity()]);
  const hours = foundation.get("rules.business_hours") as BusinessHours | undefined;
  const workdays = hours?.days?.length ? hours.days : [1, 2, 3, 4, 5];
  let days = 0;
  for (let i = 0; i < periodDays; i += 1) {
    const weekday = new Date(`${localDay(now - i * DAY, timeZone)}T12:00:00Z`).getUTCDay();
    if (workdays.includes(weekday)) days += 1;
  }
  const due = ((actions.data ?? []) as Array<{ due_at: string; completed_at: string | null }>).filter((row) => Date.parse(row.due_at) <= now);
  const targets = (foundation.get(rep.role === "closer" ? "targets.closer" : "targets.setter") as RoleTargets | undefined) ?? null;
  const closeRate = foundation.get("goal.close_rate_pct");
  return {
    rep,
    periodDays,
    metrics: scorecard(
      rep.role,
      {
        activity,
        days: Math.max(1, days),
        firstTouchSeconds: ((leads.data ?? []) as Array<{ time_to_first_human_touch_seconds: number }>).map((row) => Number(row.time_to_first_human_touch_seconds)),
        followUpsDue: due.length,
        followUpsOnTime: due.filter((row) => row.completed_at && Date.parse(row.completed_at) <= Date.parse(row.due_at)).length,
      },
      targets,
      typeof closeRate === "number" ? closeRate : null
    ),
    coaching: coachingMoments((quality.data ?? []) as Parameters<typeof coachingMoments>[0]),
  };
}
