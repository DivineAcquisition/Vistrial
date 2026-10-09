import "server-only";

import { requireConfig } from "@/lib/config/server";
import type { AfterHoursMode, BusinessHours } from "@/lib/config/clock";
import type { GhlDb } from "@/lib/ghl/tokens";
import { agentMayRun, startRun } from "@/lib/live/record";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { leadDisplayName } from "@/lib/notifications/copy";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { evaluateClock, escalationLevel, type ClockTouch } from "@/lib/sentry/clock";

type Query = PromiseLike<{ data: unknown }> & {
  select: (columns: string) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, value: unknown[]) => Query;
  is: (column: string, value: null) => Query;
  gte: (column: string, value: string) => Query;
  gt: (column: string, value: string) => Query;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => Query;
  limit: (count: number) => Query;
  update: (values: object) => Query;
  insert: (values: object) => Query;
  upsert: (values: object, options: { onConflict: string }) => Query;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
  single: () => Promise<{ data: Record<string, unknown> | null }>;
};
type Loose = { from: (table: string) => Query };

/**
 * Sentry's safety sweep. Event-shaped changes call the same watchLead path.
 * Practice mode stores clocks and in-product alerts and sends nothing out.
 * Sentry never contacts a lead.
 */

const PER_ORG = 120;
const STALE_MS = 20 * 60_000;

type Level = { after_windows: number; severity: string; notify: string[] };

export async function runSentrySweep(db: GhlDb): Promise<{ workspaces: number; leads: number; alerts: number; waiting: number; ms: number }> {
  const raw = db as unknown as Loose;
  const listed = (await raw
    .from("sentry_workspaces")
    .select("org_id, mode, watch_from, last_sweep_at, scan_after")
    .in("mode", ["practice", "live"])
    .order("last_sweep_at", { ascending: true, nullsFirst: true })
    .limit(12)) as { data: Array<{ org_id: string; mode: string; watch_from: string | null; last_sweep_at: string | null; scan_after: string | null }> | null };
  const spaces = listed.data ?? [];
  let leads = 0;
  let alerts = 0;
  let waiting = 0;
  const started = Date.now();
  for (const space of spaces) {
    const gap = space.last_sweep_at ? Date.now() - Date.parse(space.last_sweep_at) : 0;
    if (gap > STALE_MS) {
      waiting += 1;
      await notifyDaAlert({
        kind: "sentry_heartbeat",
        title: "Sentry was not sweeping a workspace",
        checkFirst: "Open Agent Health. No lead details are included.",
        severity: "high",
        orgId: space.org_id,
        detail: { gapMinutes: Math.round(gap / 60_000) },
      });
    }
    const result = await sweepOrg(db, space, gap > 30 * 60_000);
    leads += result.leads;
    alerts += result.alerts;
    await raw.from("sentry_workspaces").update({ last_sweep_at: new Date().toISOString(), scan_after: result.cursor, last_error: result.error, updated_at: new Date().toISOString() }).eq("org_id", space.org_id);
  }
  return { workspaces: spaces.length, leads, alerts, waiting, ms: Date.now() - started };
}

async function sweepOrg(
  db: GhlDb,
  space: { org_id: string; mode: string; watch_from: string | null; scan_after: string | null },
  catchup: boolean
): Promise<{ leads: number; alerts: number; cursor: string | null; error: string | null }> {
  const may = await agentMayRun(space.org_id, "sentry");
  if (!may.ok) return { leads: 0, alerts: 0, cursor: space.scan_after, error: may.reason };
  const gate = await requireConfig(db, space.org_id, "response_clock");
  if (!gate.ok) {
    await notifyDaAlert({
      kind: "sentry_config",
      title: "Sentry stopped watching a workspace",
      checkFirst: "The response settings are incomplete. No lead details are included.",
      severity: "high",
      orgId: space.org_id,
      detail: { reason: gate.reason.slice(0, 180) },
    });
    return { leads: 0, alerts: 0, cursor: space.scan_after, error: "config" };
  }
  const values = gate.config.values as Record<string, unknown>;
  const hours = values["identity.business_hours"] as BusinessHours | undefined;
  const hoursMissing = !hours || !hours.days;
  const raw = db as unknown as Loose;
  let query = raw
    .from("leads")
    .select("id, first_name, status, opted_in_at, created_at, first_human_touch_at, do_not_contact, merged_into, assigned_setter_id, assigned_closer_id, timezone")
    .eq("org_id", space.org_id)
    .eq("is_test", false)
    .is("merged_into", null)
    .gte("created_at", space.watch_from ?? new Date(0).toISOString())
    .order("id", { ascending: true })
    .limit(PER_ORG);
  if (space.scan_after) query = query.gt("id", space.scan_after);
  const { data: leads } = await query;
  const rows = (leads ?? []) as Array<Record<string, unknown>>;
  const cursor = rows.length < PER_ORG ? null : String(rows[rows.length - 1]?.id ?? "");
  let alerts = 0;
  const grouped = new Map<string, number>();
  for (const lead of rows) {
    const sent = await watchLead(db, { orgId: space.org_id, mode: space.mode, values, hours, hoursMissing, configVersion: gate.config.version, lead, catchup, grouped });
    if (sent) alerts += 1;
  }
  return { leads: rows.length, alerts, cursor, error: null };
}

async function watchLead(
  db: GhlDb,
  args: {
    orgId: string;
    mode: string;
    values: Record<string, unknown>;
    hours: BusinessHours | undefined;
    hoursMissing: boolean;
    configVersion: string;
    lead: Record<string, unknown>;
    catchup: boolean;
    grouped: Map<string, number>;
  }
): Promise<boolean> {
  const raw = db as unknown as Loose;
  const leadId = String(args.lead.id);
  const closed = args.lead.status === "closed_won" || args.lead.status === "closed_lost";
  const { data: opt } = await raw.from("lead_opt_outs").select("lead_id").eq("lead_id", leadId).eq("org_id", args.orgId).maybeSingle();
  const first = args.lead.first_human_touch_at as string | null;
  const kind = first ? "follow_up" : "first_touch";
  const cadence = Array.isArray(args.values["response.follow_up_cadence"]) ? (args.values["response.follow_up_cadence"] as Array<{ stage: string; max_gap_hours: number }>) : [];
  const stageRule = cadence.find((row) => row.stage === args.lead.status);
  const windowMinutes = kind === "first_touch" ? Number(args.values["response.first_touch_minutes"] ?? 15) : Number(stageRule?.max_gap_hours ?? 0) * 60;
  const startedAt = kind === "first_touch" ? String(args.lead.opted_in_at ?? args.lead.created_at) : first!;
  const { data: touches } = await raw
    .from("touches")
    .select("occurred_at, type, channel, queued_offline")
    .eq("org_id", args.orgId)
    .eq("lead_id", leadId)
    .gte("occurred_at", startedAt)
    .order("occurred_at", { ascending: true })
    .limit(20);
  const answer = evaluateClock({
    now: new Date().toISOString(),
    startedAt,
    kind,
    windowMinutes: windowMinutes || 1,
    afterHoursWindowMinutes: Number(args.values["response.after_hours_window_minutes"] ?? windowMinutes),
    mode: (args.values["response.after_hours"] as AfterHoursMode) ?? "keep_running",
    warningPercent: Number(args.values["response.warning_threshold_percent"] ?? 75),
    hours: args.hours ?? { days: {} },
    timeZone: String(args.values["identity.timezone"] ?? "America/New_York"),
    countedChannels: (args.values["response.counted_touch_types"] as string[]) ?? ["call", "text", "email"],
    touches: ((touches ?? []) as Array<{ occurred_at: string; type: string; channel: string; queued_offline: boolean }>).map(
      (touch): ClockTouch => ({ at: touch.occurred_at, type: touch.type === "human" ? "human" : "system", channel: touch.channel, manual: touch.queued_offline === true })
    ),
    closed,
    optedOut: Boolean(opt),
    doNotContact: args.lead.do_not_contact === true,
    merged: false,
    noWindow: kind === "follow_up" && !stageRule,
    hoursMissing: args.hoursMissing,
  });

  const { data: existing } = await raw.from("sentry_clocks").select("id, state").eq("org_id", args.orgId).eq("lead_id", leadId).maybeSingle();
  const row = {
    org_id: args.orgId,
    lead_id: leadId,
    kind,
    state: answer.state,
    started_at: startedAt,
    deadline_at: answer.deadlineAt,
    resolved_at: answer.resolvedAt,
    window_minutes: windowMinutes || null,
    elapsed_minutes: answer.elapsedMinutes,
    overdue_minutes: answer.overdueMinutes,
    reason: answer.reason,
    config_version: args.configVersion,
    manual: answer.manual,
    updated_at: new Date().toISOString(),
  };
  const saved = existing
    ? await raw.from("sentry_clocks").update(row).eq("id", existing.id).select("id").single()
    : await raw.from("sentry_clocks").insert(row).select("id").single();
  const clockId = String(saved.data?.id ?? existing?.id ?? "");
  const changed = existing?.state !== answer.state;

  if (answer.state === "resolved" || answer.state === "not_applicable") {
    await raw
      .from("sentry_alerts")
      .update({ status: answer.state === "resolved" ? "resolved" : "withdrawn", resolved_at: new Date().toISOString(), withdraw_reason: answer.reason })
      .eq("org_id", args.orgId)
      .eq("lead_id", leadId)
      .in("status", ["open", "acknowledged", "snoozed"]);
    if (answer.state === "resolved" && changed) {
      await raw.from("sentry_measurements").insert({
        org_id: args.orgId,
        lead_id: leadId,
        clock_id: clockId || null,
        metric: kind === "first_touch" ? "time_to_first_touch" : "gap",
        seconds: answer.elapsedMinutes * 60,
        met: answer.deadlineAt ? Date.parse(answer.resolvedAt ?? "") <= Date.parse(answer.deadlineAt) : null,
        detail: answer.manual ? "manually logged" : "human touch",
      });
    }
    return false;
  }

  if (answer.state !== "at_risk" && answer.state !== "missed") return false;
  const levels = (Array.isArray(args.values["escalation.levels"]) ? args.values["escalation.levels"] : []) as Level[];
  const windowsOver = windowMinutes > 0 ? answer.elapsedMinutes / windowMinutes : 0;
  const level = answer.state === "at_risk" ? 0 : (escalationLevel(windowsOver, levels) ?? 1);
  const { data: open } = await raw.from("sentry_alerts").select("id, level, status, snoozed_until").eq("lead_id", leadId).in("status", ["open", "acknowledged", "snoozed"]).maybeSingle();
  const snoozedUntil = typeof open?.snoozed_until === "string" ? open.snoozed_until : null;
  if (open?.status === "snoozed" && snoozedUntil && Date.parse(snoozedUntil) > Date.now()) return false;
  if (open && Number(open.level) === level) return false;
  const name = leadDisplayName(args.lead.first_name as string | null);
  const title = answer.state === "at_risk" ? `${name} is close to a missed window` : `${name} missed a response window`;
  const body = `${answer.reason} Open the case file.`;
  if (open) {
    await raw.from("sentry_alerts").update({ level, kind: level === 0 ? "nudge" : "escalation", title, body, status: "open" }).eq("id", open.id);
  } else {
    await raw.from("sentry_alerts").insert({ org_id: args.orgId, lead_id: leadId, clock_id: clockId || null, level, kind: level === 0 ? "nudge" : "escalation", title, body });
  }
  if (answer.state === "missed" || answer.state === "at_risk") {
    await raw.from("sentry_handoffs").upsert({ org_id: args.orgId, lead_id: leadId, status: "relay_unavailable" }, { onConflict: "org_id,lead_id" });
  }
  if (changed) {
    const recorder = await startRun({
      orgId: args.orgId,
      agentId: "sentry",
      triggerKey: `sentry:${leadId}:${answer.state}:${level}`,
      subjectLabel: `Response window for ${name}`,
      subjectHref: `/app/cases/${leadId}`,
      leadId,
      plan: ["Checking the response window", level === 0 ? "Nudging the assigned person" : "Escalating", "Asking Relay for a draft"],
      configVersion: args.configVersion,
    }).catch(() => null);
    if (recorder) {
      await recorder.begin();
      const step = await recorder.step(level === 0 ? "Nudging the assigned person" : "Escalating");
      await step.done({ detail: "Relay is not available yet, so no draft was written. Nothing was sent to the lead." });
      await recorder.finish({ reason: answer.reason });
    }
  }
  if (args.mode !== "live") return true;
  const assignee = (args.lead.assigned_setter_id ?? args.lead.assigned_closer_id) as string | null;
  let memberQuery = raw.from("org_members").select("id, user_id, role").eq("org_id", args.orgId).eq("active", true);
  if (assignee) memberQuery = memberQuery.eq("id", assignee);
  else memberQuery = memberQuery.eq("role", "owner");
  const { data: members } = await memberQuery.limit(3);
  const severity = levels[Math.max(0, level - 1)]?.severity ?? "warning";
  for (const member of (members ?? []) as Array<{ id: string; user_id: string }>) {
    const count = (args.grouped.get(member.user_id) ?? 0) + 1;
    args.grouped.set(member.user_id, count);
    if (args.catchup && count > 1 && severity !== "critical") continue;
    if (!args.catchup && count > 8 && severity !== "critical") continue;
    const grouped = args.catchup || count === 9;
    await enqueueNotification(db, {
      orgId: args.orgId,
      eventType: "speed_to_lead",
      channel: "push",
      recipientUserId: member.user_id,
      recipientMemberId: member.id,
      subjectKind: "sentry",
      subjectIds: [leadId],
      title: grouped ? "Several leads need a person" : title,
      body: grouped ? "Sentry was away. Open Vistrial for the leads that waited. Nothing was sent to them." : body,
      href: `/app/cases/${leadId}`,
      dedupeKey: grouped ? `sentry:batch:${member.user_id}:${new Date().toISOString().slice(0, 13)}` : `sentry:${leadId}:${level}`,
      escalationStep: Math.max(1, level),
      isEmergency: severity === "critical",
    }).catch(() => null);
  }
  return true;
}
