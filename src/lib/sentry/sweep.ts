import "server-only";

import { requireConfig } from "@/lib/config/server";
import { isOpenAt, type AfterHoursMode, type BusinessHours } from "@/lib/config/clock";
import type { GhlDb } from "@/lib/ghl/tokens";
import { agentMayRun, startRun } from "@/lib/live/record";
import { leadDisplayName } from "@/lib/notifications/copy";
import { loadOrgNotifyContext, memberById } from "@/lib/notifications/members";
import { offerTeam, offerToMember } from "@/lib/notifications/offer";
import type { MemberNotifyTarget } from "@/lib/notifications/types";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { clockTouchFromRow, deadlineAt, evaluateClock, escalationLevel, type ClockAnswer, type ClockTouch } from "@/lib/sentry/clock";
import { followUpStart, holdForQuietHours, levelFor, routeChannels, routeTargets, type EscalationLevel, type SendChannel } from "@/lib/sentry/routing";

type Query = PromiseLike<{ data: unknown }> & {
  select: (columns: string) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, value: unknown[]) => Query;
  contains: (column: string, value: unknown[]) => Query;
  is: (column: string, value: null) => Query;
  not: (column: string, operator: string, value: null) => Query;
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
 * Sentry's sweep. Database triggers withdraw alerts the moment a lead opts
 * out, is closed, merged, or marked do not contact, and mark a clock when a
 * person touches the lead; the sweep reads marked clocks first.
 * Practice mode stores clocks and in-product alerts and sends nothing out.
 * Sentry never contacts a lead and never writes to a CRM.
 */

const PER_ORG = 120;
const DIRTY_PER_ORG = 60;
const STALE_MS = 20 * 60_000;
const CATCHUP_MS = 30 * 60_000;
const PER_PERSON = 8;
const HELD = ["paused", "workspace"];

type Space = {
  org_id: string;
  mode: string;
  watch_from: string | null;
  last_sweep_at: string | null;
  scan_after: string | null;
  last_error: string | null;
};

type Team = {
  smsEnabled: boolean;
  members: MemberNotifyTarget[];
  setters: MemberNotifyTarget[];
  closers: MemberNotifyTarget[];
  managers: MemberNotifyTarget[];
};

type OrgRun = {
  orgId: string;
  mode: string;
  values: Record<string, unknown>;
  hours: BusinessHours | undefined;
  hoursMissing: boolean;
  timeZone: string;
  configVersion: string;
  catchup: boolean;
  grouped: Map<string, number>;
  team: Team | null;
};

export async function runSentrySweep(db: GhlDb): Promise<{ workspaces: number; leads: number; alerts: number; waiting: number; ms: number }> {
  const raw = db as unknown as Loose;
  const listed = (await raw
    .from("sentry_workspaces")
    .select("org_id, mode, watch_from, last_sweep_at, scan_after, last_error")
    .in("mode", ["practice", "live"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(12)) as { data: Space[] | null };
  const spaces = listed.data ?? [];
  let leads = 0;
  let alerts = 0;
  let waiting = 0;
  const started = Date.now();
  for (const space of spaces) {
    const now = new Date().toISOString();
    const gap = space.last_sweep_at ? Date.now() - Date.parse(space.last_sweep_at) : 0;
    const wasHeld = HELD.includes(space.last_error ?? "");
    const result = await sweepOrg(db, space, gap > CATCHUP_MS).catch((error: unknown) => ({
      leads: 0,
      alerts: 0,
      cursor: space.scan_after,
      error: "failed",
      held: false,
      detail: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    }));
    if (result.held) {
      await raw.from("sentry_workspaces").update({ last_checked_at: now, last_error: result.error, updated_at: now }).eq("org_id", space.org_id);
      continue;
    }
    if (gap > STALE_MS && !wasHeld && !result.error) {
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
    if (result.error && result.error !== space.last_error) {
      await notifyDaAlert({
        kind: result.error === "config" ? "sentry_config" : "sentry_failed",
        title: "Sentry stopped watching a workspace",
        checkFirst:
          result.error === "config"
            ? "The response settings are incomplete. No lead details are included."
            : "The sweep failed for this workspace. No lead details are included.",
        severity: "high",
        orgId: space.org_id,
        detail: { reason: result.detail },
      });
    }
    const swept = result.error ? {} : { last_sweep_at: now, scan_after: result.cursor };
    await raw.from("sentry_workspaces").update({ ...swept, last_checked_at: now, last_error: result.error, updated_at: now }).eq("org_id", space.org_id);
    leads += result.leads;
    alerts += result.alerts;
  }
  return { workspaces: spaces.length, leads, alerts, waiting, ms: Date.now() - started };
}

async function sweepOrg(
  db: GhlDb,
  space: Space,
  catchup: boolean
): Promise<{ leads: number; alerts: number; cursor: string | null; error: string | null; held: boolean; detail: string | null }> {
  const may = await agentMayRun(space.org_id, "sentry");
  if (!may.ok) return { leads: 0, alerts: 0, cursor: space.scan_after, error: may.reason, held: true, detail: null };
  const gate = await requireConfig(db, space.org_id, "response_clock");
  if (!gate.ok) return { leads: 0, alerts: 0, cursor: space.scan_after, error: "config", held: false, detail: gate.reason.slice(0, 180) };
  const raw = db as unknown as Loose;
  const { data: org } = await raw.from("organizations").select("status").eq("id", space.org_id).maybeSingle();
  const values = gate.config.values as Record<string, unknown>;
  const hours = values["identity.business_hours"] as BusinessHours | undefined;
  const mode = org?.status === "active" ? space.mode : "practice";
  const run: OrgRun = {
    orgId: space.org_id,
    mode,
    values,
    hours,
    hoursMissing: !hours || !hours.days,
    timeZone: String(values["identity.timezone"] ?? "America/New_York"),
    configVersion: gate.config.version,
    catchup,
    grouped: new Map(),
    team: mode === "live" ? await loadTeam(db, space.org_id) : null,
  };

  const columns = "id, first_name, status, opted_in_at, created_at, first_human_touch_at, do_not_contact, merged_into, assigned_setter_id, assigned_closer_id";
  const { data: dirty } = await raw
    .from("sentry_clocks")
    .select("lead_id")
    .eq("org_id", space.org_id)
    .not("dirty_at", "is", null)
    .order("dirty_at", { ascending: true })
    .limit(DIRTY_PER_ORG);
  const dirtyIds = ((dirty ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id);
  const { data: dirtyLeads } = dirtyIds.length
    ? await raw.from("leads").select(columns).eq("org_id", space.org_id).eq("is_test", false).in("id", dirtyIds)
    : { data: [] };

  let query = raw
    .from("leads")
    .select(columns)
    .eq("org_id", space.org_id)
    .eq("is_test", false)
    .is("merged_into", null)
    .gte("created_at", space.watch_from ?? new Date(0).toISOString())
    .order("id", { ascending: true })
    .limit(PER_ORG);
  if (space.scan_after) query = query.gt("id", space.scan_after);
  const { data: scanned } = await query;
  const scanRows = (scanned ?? []) as Array<Record<string, unknown>>;
  const cursor = scanRows.length < PER_ORG ? null : String(scanRows[scanRows.length - 1]?.id ?? "");

  const seen = new Set<string>();
  const rows = [...((dirtyLeads ?? []) as Array<Record<string, unknown>>), ...scanRows].filter((lead) => {
    const id = String(lead.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  let alerts = 0;
  for (const lead of rows) {
    if (await watchLead(db, run, lead)) alerts += 1;
  }
  return { leads: rows.length, alerts, cursor, error: null, held: false, detail: null };
}

async function loadTeam(db: GhlDb, orgId: string): Promise<Team | null> {
  const ctx = await loadOrgNotifyContext(db, orgId);
  if (!ctx) return null;
  return { smsEnabled: ctx.org.smsEmergenciesEnabled === true, members: ctx.members, setters: ctx.setters, closers: ctx.closers, managers: ctx.managers };
}

function clockInput(run: OrgRun, args: { kind: "first_touch" | "follow_up"; startedAt: string; windowMinutes: number; touches: ClockTouch[]; lead: Record<string, unknown>; optedOut: boolean; noWindow: boolean }) {
  return {
    now: new Date().toISOString(),
    startedAt: args.startedAt,
    kind: args.kind,
    windowMinutes: args.windowMinutes || 1,
    afterHoursWindowMinutes: Number(run.values["response.after_hours_window_minutes"] ?? args.windowMinutes),
    mode: (run.values["response.after_hours"] as AfterHoursMode) ?? "keep_running",
    warningPercent: Number(run.values["response.warning_threshold_percent"] ?? 75),
    hours: run.hours ?? { days: {} },
    timeZone: run.timeZone,
    countedChannels: counted(run),
    touches: args.touches,
    closed: args.lead.status === "closed_won" || args.lead.status === "closed_lost",
    optedOut: args.optedOut,
    doNotContact: args.lead.do_not_contact === true,
    merged: Boolean(args.lead.merged_into),
    noWindow: args.noWindow,
    hoursMissing: run.hoursMissing,
  };
}

function counted(run: OrgRun): string[] {
  return (run.values["response.counted_touch_types"] as string[]) ?? ["call", "text", "email"];
}

async function watchLead(db: GhlDb, run: OrgRun, lead: Record<string, unknown>): Promise<boolean> {
  const raw = db as unknown as Loose;
  const leadId = String(lead.id);
  const { data: opt } = await raw.from("lead_opt_outs").select("lead_id").eq("lead_id", leadId).eq("org_id", run.orgId).maybeSingle();
  const optedOut = Boolean(opt);
  const arrived = String(lead.opted_in_at ?? lead.created_at);
  const first = lead.first_human_touch_at as string | null;
  const { data: touchRows } = await raw
    .from("touches")
    .select("occurred_at, type, channel, queued_offline, drafted_by_agent")
    .eq("org_id", run.orgId)
    .eq("lead_id", leadId)
    .gte("occurred_at", arrived)
    .order("occurred_at", { ascending: false })
    .limit(40);
  const relayCounts = run.values["response.relay_counts_as_human_touch"];
  const touches = (
    (touchRows ?? []) as Array<{ occurred_at: string; type: string; channel: string; queued_offline: boolean; drafted_by_agent: string | null }>
  ).map((touch): ClockTouch => clockTouchFromRow(touch, relayCounts));
  const { data: existing } = await raw
    .from("sentry_clocks")
    .select("id, state, kind, started_at, deadline_at")
    .eq("org_id", run.orgId)
    .eq("lead_id", leadId)
    .maybeSingle();

  const firstWindow = Number(run.values["response.first_touch_minutes"] ?? 15);
  const firstAnswer = evaluateClock(clockInput(run, { kind: "first_touch", startedAt: arrived, windowMinutes: firstWindow, touches, lead, optedOut, noWindow: false }));
  // first_human_touch_at counts any channel, so it only decides when the earliest touches fell outside the read.
  const firstDone = firstAnswer.state === "resolved" || (Boolean(first) && touches.length >= 40);

  if (firstDone && existing?.kind !== "follow_up" && firstAnswer.state === "resolved") {
    await measure(raw, run, leadId, existing?.id, "time_to_first_touch", firstAnswer, firstAnswer.resolvedAt, deadlineFor(run, arrived, firstWindow));
  }

  const cadence = Array.isArray(run.values["response.follow_up_cadence"]) ? (run.values["response.follow_up_cadence"] as Array<{ stage: string; max_gap_hours: number }>) : [];
  const stageRule = cadence.find((row) => row.stage === lead.status);
  const kind: "first_touch" | "follow_up" = firstDone ? "follow_up" : "first_touch";
  const windowMinutes = kind === "first_touch" ? firstWindow : Number(stageRule?.max_gap_hours ?? 0) * 60;
  const startedAt = kind === "first_touch" ? arrived : followUpStart(touches, counted(run), firstAnswer.resolvedAt ?? first ?? arrived);
  const answer =
    kind === "first_touch"
      ? firstAnswer
      : evaluateClock(clockInput(run, { kind, startedAt, windowMinutes, touches, lead, optedOut, noWindow: !stageRule }));

  if (kind === "follow_up" && existing?.kind === "follow_up" && typeof existing.started_at === "string" && Date.parse(startedAt) > Date.parse(existing.started_at)) {
    const gapMinutes = Math.round((Date.parse(startedAt) - Date.parse(existing.started_at)) / 60_000);
    await raw.from("sentry_measurements").insert({
      org_id: run.orgId,
      lead_id: leadId,
      clock_id: existing.id,
      metric: "gap",
      seconds: gapMinutes * 60,
      met: typeof existing.deadline_at === "string" ? Date.parse(startedAt) <= Date.parse(existing.deadline_at) : null,
      detail: "human touch",
    });
  }

  const row = {
    org_id: run.orgId,
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
    config_version: run.configVersion,
    manual: answer.manual,
    dirty_at: null,
    updated_at: new Date().toISOString(),
  };
  const saved = existing
    ? await raw.from("sentry_clocks").update(row).eq("id", existing.id).select("id").single()
    : await raw.from("sentry_clocks").insert(row).select("id").single();
  const clockId = String(saved.data?.id ?? existing?.id ?? "");
  const changed = existing?.state !== answer.state || existing?.kind !== kind;

  const { data: open } = await raw
    .from("sentry_alerts")
    .select("id, level, status, snoozed_until, notified_at, acknowledged_at, unacknowledged_sent_at, created_at")
    .eq("org_id", run.orgId)
    .eq("lead_id", leadId)
    .in("status", ["open", "acknowledged", "snoozed"])
    .maybeSingle();

  if (answer.state !== "at_risk" && answer.state !== "missed") {
    if (open) {
      const restarted = typeof existing?.started_at === "string" && Date.parse(existing.started_at) !== Date.parse(startedAt);
      const touched = answer.state === "resolved" || existing?.kind !== kind || restarted;
      await raw
        .from("sentry_alerts")
        .update({ status: touched ? "resolved" : "withdrawn", resolved_at: new Date().toISOString(), withdraw_reason: answer.reason })
        .eq("id", open.id);
      await raw
        .from("notifications")
        .update({ status: "cancelled", error_text: "sentry_resolved", updated_at: new Date().toISOString() })
        .eq("org_id", run.orgId)
        .eq("subject_kind", "sentry")
        .eq("status", "queued")
        .contains("subject_ids", [leadId]);
    }
    return false;
  }

  const levels = (Array.isArray(run.values["escalation.levels"]) ? run.values["escalation.levels"] : []) as EscalationLevel[];
  const windowsOver = windowMinutes > 0 ? answer.elapsedMinutes / windowMinutes : 0;
  const level = answer.state === "at_risk" ? 0 : (escalationLevel(windowsOver, levels) ?? 1);
  const rule = levelFor(level, levels);
  const severity = rule?.severity ?? "warning";
  const name = leadDisplayName(lead.first_name as string | null);
  const title = answer.state === "at_risk" ? `${name} is close to a missed window` : `${name} missed a response window`;
  const body = `${answer.reason} Open the case file.`;

  const snoozedUntil = typeof open?.snoozed_until === "string" ? open.snoozed_until : null;
  const snoozed = open?.status === "snoozed" && snoozedUntil !== null && Date.parse(snoozedUntil) > Date.now();
  const snoozeOver = open?.status === "snoozed" && !snoozed;
  const raised = !open || Number(open.level) !== level;
  let alertId = open ? String(open.id) : "";
  let notifiedAt = typeof open?.notified_at === "string" ? open.notified_at : null;

  if (!open) {
    const created = await raw
      .from("sentry_alerts")
      .insert({ org_id: run.orgId, lead_id: leadId, clock_id: clockId || null, level, kind: level === 0 ? "nudge" : "escalation", title, body })
      .select("id")
      .single();
    alertId = String(created.data?.id ?? "");
    notifiedAt = null;
  } else if (raised || snoozeOver) {
    await raw
      .from("sentry_alerts")
      .update({ level, kind: level === 0 ? "nudge" : "escalation", title, body, status: "open", snoozed_until: null, notified_at: null, unacknowledged_sent_at: null })
      .eq("id", open.id);
    notifiedAt = null;
  }
  if (!alertId) return false;

  let relayQueued = false;
  if (answer.state === "missed") {
    if (run.mode === "live") {
      const { enqueueRelayJob } = await import("@/lib/relay/run");
      relayQueued = await enqueueRelayJob({ orgId: run.orgId, leadId, trigger: "missed_window", dedupeKey: `missed_window:${leadId}:${startedAt}` })
        .then(() => true)
        .catch(() => false);
    }
    await raw
      .from("sentry_handoffs")
      .upsert({ org_id: run.orgId, lead_id: leadId, status: relayQueued ? "relay_queued" : "relay_unavailable" }, { onConflict: "org_id,lead_id" });
  }
  if (changed || raised) await recordRun(run, { leadId, name, level, answer, relayQueued });

  if (snoozed) return false;
  const open_ = run.hours && !run.hoursMissing ? isOpenAt(new Date(), run.hours, run.timeZone) : true;
  const hold = holdForQuietHours({
    quietHours: run.values["escalation.quiet_hours"],
    urgentException: run.values["escalation.urgent_exception"],
    severity,
    open: open_,
  });

  if (!notifiedAt) {
    if (run.mode !== "live") {
      await raw.from("sentry_alerts").update({ notified_at: new Date().toISOString() }).eq("id", alertId);
      return true;
    }
    if (hold) return true;
    const notify = level === 0 ? ["assignee"] : (rule?.notify ?? ["assignee"]);
    const channels = level === 0 ? ["push"] : (rule?.channels ?? ["push"]);
    await send(db, run, { leadId, lead, notify, channels, severity, title, body, dedupeKey: `sentry:${leadId}:${level}`, step: Math.max(1, level) });
    await raw.from("sentry_alerts").update({ notified_at: new Date().toISOString() }).eq("id", alertId);
    return true;
  }

  const waitMinutes = Number(run.values["escalation.unacknowledged_minutes"] ?? 60);
  const unanswered =
    run.mode === "live" &&
    level >= 1 &&
    open?.status === "open" &&
    !open.acknowledged_at &&
    !open.unacknowledged_sent_at &&
    Date.now() - Date.parse(notifiedAt) >= waitMinutes * 60_000;
  if (unanswered && !hold) {
    const next = String(run.values["escalation.unacknowledged_next"] ?? "managers");
    await send(db, run, {
      leadId,
      lead,
      notify: [next],
      channels: rule?.channels ?? ["push"],
      severity,
      title: `Nobody has answered the alert for ${name}`,
      body: `${answer.reason} Open the case file.`,
      dedupeKey: `sentry:${leadId}:unacknowledged`,
      step: Math.max(2, level + 1),
    });
    await raw.from("sentry_alerts").update({ unacknowledged_sent_at: new Date().toISOString() }).eq("id", alertId);
  }
  return false;
}

function deadlineFor(run: OrgRun, startedAt: string, windowMinutes: number): string | null {
  if (!run.hours || run.hoursMissing) return null;
  const at = deadlineAt({
    startedAt: new Date(startedAt),
    windowMinutes,
    afterHoursWindowMinutes: Number(run.values["response.after_hours_window_minutes"] ?? windowMinutes),
    mode: (run.values["response.after_hours"] as AfterHoursMode) ?? "keep_running",
    hours: run.hours,
    timeZone: run.timeZone,
  });
  return at ? at.toISOString() : null;
}

async function measure(
  raw: Loose,
  run: OrgRun,
  leadId: string,
  clockId: unknown,
  metric: string,
  answer: ClockAnswer,
  resolvedAt: string | null,
  deadline: string | null
) {
  const { data: already } = await raw.from("sentry_measurements").select("id").eq("org_id", run.orgId).eq("lead_id", leadId).eq("metric", metric).maybeSingle();
  if (already) return;
  await raw.from("sentry_measurements").insert({
    org_id: run.orgId,
    lead_id: leadId,
    clock_id: typeof clockId === "string" ? clockId : null,
    metric,
    seconds: answer.elapsedMinutes * 60,
    met: deadline && resolvedAt ? Date.parse(resolvedAt) <= Date.parse(deadline) : null,
    detail: answer.manual ? "manually logged" : "human touch",
  });
}

async function recordRun(run: OrgRun, args: { leadId: string; name: string; level: number; answer: ClockAnswer; relayQueued: boolean }) {
  const recorder = await startRun({
    orgId: run.orgId,
    agentId: "sentry",
    triggerKey: `sentry:${args.leadId}:${args.answer.state}:${args.level}`,
    subjectLabel: `Response window for ${args.name}`,
    subjectHref: `/app/cases/${args.leadId}`,
    leadId: args.leadId,
    plan: ["Checking the response window", args.level === 0 ? "Nudging the assigned person" : "Escalating", "Asking Relay for a draft"],
    configVersion: run.configVersion,
  }).catch(() => null);
  if (!recorder) return;
  await recorder.begin();
  const step = await recorder.step(args.level === 0 ? "Nudging the assigned person" : "Escalating");
  await step.done({
    detail:
      run.mode !== "live"
        ? "Practice mode: the alert is shown in Vistrial only. Nothing was sent to the team or the lead."
        : args.answer.state !== "missed"
          ? "Nothing was sent to the lead."
          : args.relayQueued
            ? "Asked Relay for a draft. A person approves it and sends it from the CRM. Nothing was sent to the lead."
            : "Relay could not be asked for a draft this time. Nothing was sent to the lead.",
  });
  await recorder.finish({ reason: args.answer.reason });
}

async function send(
  db: GhlDb,
  run: OrgRun,
  args: {
    leadId: string;
    lead: Record<string, unknown>;
    notify: string[];
    channels: string[];
    severity: string;
    title: string;
    body: string;
    dedupeKey: string;
    step: number;
  }
) {
  const team = run.team;
  const critical = args.severity === "critical";
  const assigneeId = (args.lead.assigned_setter_id ?? args.lead.assigned_closer_id) as string | null;
  const route = team
    ? routeTargets(args.notify, { assignee: memberById(team.members, assigneeId), setters: team.setters, closers: team.closers, managers: team.managers })
    : { targets: [] as MemberNotifyTarget[], fellBack: true };
  if (route.targets.length === 0) {
    await notifyDaAlert({
      kind: "sentry_no_recipient",
      title: "Sentry had nobody to tell about a missed window",
      checkFirst: "Add an owner or setter to the workspace. No lead details are included.",
      severity: "high",
      orgId: run.orgId,
    });
    return;
  }
  const href = `/app/cases/${args.leadId}`;
  const channels = routeChannels(args.channels);
  for (const target of route.targets) {
    const count = (run.grouped.get(target.userId) ?? 0) + 1;
    run.grouped.set(target.userId, count);
    if (run.catchup && count > 1 && !critical) continue;
    if (!run.catchup && count > PER_PERSON + 1 && !critical) continue;
    const grouped = !critical && (run.catchup || count === PER_PERSON + 1);
    const title = grouped ? "Several leads need a person" : args.title;
    const body = grouped
      ? run.catchup
        ? "Sentry was away. Open Vistrial for the leads that waited. Nothing was sent to them."
        : "More leads need a person. Open Vistrial to see them all. Nothing was sent to them."
      : args.body;
    const dedupeKey = grouped ? `sentry:batch:${target.userId}:${new Date().toISOString().slice(0, 13)}` : args.dedupeKey;
    const offer = (channel: SendChannel, exact: boolean) =>
      offerToMember(db, {
        target,
        isEscalationToAdmin: critical,
        skipWorkingHours: true,
        exactChannel: exact,
        orgSmsEnabled: team?.smsEnabled ?? false,
        input: {
          orgId: run.orgId,
          eventType: "speed_to_lead",
          channel,
          subjectKind: "sentry",
          subjectIds: [args.leadId],
          title,
          body,
          href: grouped ? "/app/agents/sentry" : href,
          dedupeKey: channel === "push" ? dedupeKey : `${dedupeKey}:${channel}`,
          escalationStep: args.step,
          isEmergency: critical,
        },
      }).catch(() => "skipped" as const);
    let reached = false;
    for (const channel of channels) {
      if (channel === "team") continue;
      const outcome = await offer(channel, true);
      if (outcome !== "skipped") reached = true;
    }
    // Every configured channel was off for this person: use whatever they allow.
    if (!reached) await offer("push", false);
  }
  if (channels.includes("team")) {
    await offerTeam(db, {
      orgId: run.orgId,
      eventType: "speed_to_lead",
      subjectKind: "sentry",
      subjectIds: [args.leadId],
      title: args.title,
      body: args.body,
      href,
      dedupeKey: `${args.dedupeKey}:team`,
      escalationStep: args.step,
      isEmergency: critical,
    }).catch(() => null);
  }
}
