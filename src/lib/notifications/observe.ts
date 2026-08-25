import type { GhlDb } from "@/lib/ghl/tokens";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import {
  CALL_SOON_MS,
  DAILY_BRIEF_WINDOW_MINUTES,
  GHOST_DETECTOR_STALE_MS,
  JOB_FAILURE_LOOKBACK_MS,
  notificationBatchBucket,
  OPEN_LEAD_STATUSES,
  SMS_EMERGENCY_DELAY_MS,
  UNMATCHED_ESCALATE_AGE_MS,
  UNMATCHED_ESCALATE_COUNT,
} from "@/lib/notifications/constants";
import { collectDailyBriefItems } from "@/lib/notifications/brief";
import { isWithinWorkingHours, localDateKey, minutesIntoWorkingDay, nextWorkingStart } from "@/lib/notifications/hours";
import { loadOrgNotifyContext, memberById } from "@/lib/notifications/members";
import {
  adoptionCopy,
  callSoonCopy,
  crmBrokenCopy,
  ghostDigestCopy,
  ingestionStalledCopy,
  jobFailureCopy,
  notificationHref,
  pendingDraftCopy,
  speedToLeadCopy,
  unassignedReadyCopy,
  unmatchedCopy,
} from "@/lib/notifications/messages";
import { offerDaConsole, offerTeam, offerToMember } from "@/lib/notifications/offer";
import type { MemberNotifyTarget } from "@/lib/notifications/types";

type EscalationType =
  | "speed_to_lead"
  | "pending_draft"
  | "unmatched_transcript"
  | "ingestion_stalled"
  | "crm_broken";

async function markEscalation(
  db: GhlDb,
  orgId: string,
  eventType: EscalationType,
  subjectId: string,
  step: number
): Promise<boolean> {
  const { error } = await db.from("notification_escalations").insert({
    org_id: orgId,
    event_type: eventType,
    subject_id: subjectId,
    step,
  });
  return !error;
}

async function alreadyStepped(
  db: GhlDb,
  orgId: string,
  eventType: EscalationType,
  subjectId: string,
  step: number
): Promise<boolean> {
  const { data } = await db
    .from("notification_escalations")
    .select("id")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("subject_id", subjectId)
    .eq("step", step)
    .maybeSingle();
  return Boolean(data);
}

async function escalationFiredAt(
  db: GhlDb,
  orgId: string,
  eventType: EscalationType,
  subjectId: string,
  step: number
): Promise<Date | null> {
  const { data } = await db
    .from("notification_escalations")
    .select("fired_at")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("subject_id", subjectId)
    .eq("step", step)
    .maybeSingle();
  return data?.fired_at ? new Date(data.fired_at) : null;
}

async function clearEscalation(
  db: GhlDb,
  orgId: string,
  eventType: EscalationType,
  subjectId: string
): Promise<void> {
  await db
    .from("notification_escalations")
    .delete()
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("subject_id", subjectId);
}

function batchKey(parts: string[]): string {
  return parts.join(":");
}

function bucket(now: Date): number {
  return notificationBatchBucket(now);
}

export async function observeOrg(db: GhlDb, orgId: string, now = new Date()): Promise<void> {
  const ctx = await loadOrgNotifyContext(db, orgId);
  if (!ctx) return;

  const { data: config } = await db
    .from("score_configs")
    .select("speed_to_lead_minutes")
    .eq("org_id", orgId)
    .maybeSingle();
  const { data: followUp } = await db
    .from("follow_up_settings")
    .select("draft_stale_days")
    .eq("org_id", orgId)
    .maybeSingle();

  const windowMinutes = config?.speed_to_lead_minutes ?? 15;
  const staleDays = followUp?.draft_stale_days ?? 5;
  const sms = ctx.org.smsEmergenciesEnabled;

  await observeSpeedToLead(db, ctx.members, ctx.setters, ctx.managers, orgId, windowMinutes, now);
  await observeUnassignedReady(db, ctx.setters, orgId, now);
  await observeGhosts(db, ctx.members, orgId, now);
  await observeDrafts(db, ctx.members, ctx.managers, orgId, staleDays, now);
  await observeCalls(db, ctx.members, orgId, now);
  await observeUnmatched(db, ctx.managers, orgId, now);
  await observeIngestion(db, ctx.managers, orgId, sms, now);
  await observeCrm(db, ctx.managers, orgId, sms, now);
  await observeAdoption(db, ctx.managers, orgId, now);
  await observeDailyBriefs(db, ctx.members, orgId, now);
}

async function observeSpeedToLead(
  db: GhlDb,
  members: MemberNotifyTarget[],
  setters: MemberNotifyTarget[],
  managers: MemberNotifyTarget[],
  orgId: string,
  windowMinutes: number,
  now: Date
) {
  const windowMs = windowMinutes * 60_000;
  const { data: leads } = await db
    .from("leads")
    .select("id, first_name, first_human_touch_at, opted_in_at, assigned_setter_id, status, is_test")
    .eq("org_id", orgId)
    .is("first_human_touch_at", null)
    .eq("is_test", false)
    .in("status", [...OPEN_LEAD_STATUSES]);

  for (const lead of leads ?? []) {
    const age = now.getTime() - Date.parse(lead.opted_in_at);
    if (age < windowMs) continue;
    const minutes = Math.round(age / 60000);
    const assigned = memberById(members, lead.assigned_setter_id);
    const copy = speedToLeadCopy([lead.first_name ?? "a lead"], minutes, Boolean(assigned));
    const href = notificationHref("/app/queue?breached=1");

    const fire = async (step: number, targets: MemberNotifyTarget[], team: boolean) => {
      if (await alreadyStepped(db, orgId, "speed_to_lead", lead.id, step)) return;
      const bucketId = bucket(now);
      for (const target of targets) {
        const key = batchKey(["speed_to_lead", String(step), target.userId, String(bucketId)]);
        await offerToMember(db, {
          target,
          now,
          isEscalationToAdmin: step === 3,
          batch: {
            key,
            subjectId: lead.id,
            title: copy.title,
            body: copy.body,
            forCount: (count) => speedToLeadCopy(Array.from({ length: count }, () => "a lead"), minutes, Boolean(assigned)),
          },
          input: {
            orgId,
            eventType: "speed_to_lead",
            channel: "push",
            actorUserId: null,
            subjectKind: "lead",
            subjectIds: [lead.id],
            title: copy.title,
            body: copy.body,
            href,
            dedupeKey: key,
            batchKey: key,
            escalationStep: step,
          },
        });
      }
      if (team) {
        await offerTeam(db, {
          orgId,
          eventType: "speed_to_lead",
          subjectKind: "lead",
          subjectIds: [lead.id],
          title: copy.title,
          body: copy.body,
          href,
          dedupeKey: batchKey(["speed_to_lead", String(step), "team", orgId, String(bucketId)]),
          escalationStep: step,
        });
      }
      await markEscalation(db, orgId, "speed_to_lead", lead.id, step);
    };

    const step1 = assigned ? [assigned] : setters;
    await fire(1, step1, false);
    if (age >= windowMs * 2) await fire(2, setters, true);
    if (age >= windowMs * 4) await fire(3, managers, false);
  }
}

async function observeUnassignedReady(
  db: GhlDb,
  setters: MemberNotifyTarget[],
  orgId: string,
  now: Date
) {
  const { data: leads } = await db
    .from("leads")
    .select("id, first_name, assigned_setter_id, lead_type, status, is_test")
    .eq("org_id", orgId)
    .eq("lead_type", "ready_track")
    .is("assigned_setter_id", null)
    .eq("is_test", false)
    .in("status", [...OPEN_LEAD_STATUSES]);

  for (const lead of leads ?? []) {
    const copy = unassignedReadyCopy(lead.first_name);
    for (const setter of setters) {
      await offerToMember(db, {
        target: setter,
        now,
        input: {
          orgId,
          eventType: "unassigned_ready",
          channel: "push",
          subjectKind: "lead",
          subjectIds: [lead.id],
          title: copy.title,
          body: copy.body,
          href: notificationHref(`/app/cases/${lead.id}`),
          dedupeKey: `unassigned_ready:${setter.userId}:${lead.id}`,
        },
      });
    }
  }
}

async function observeGhosts(db: GhlDb, members: MemberNotifyTarget[], orgId: string, now: Date) {
  const { data: leads } = await db
    .from("leads")
    .select("id, first_name, assigned_setter_id, assigned_closer_id, ghost_approaching_at, status")
    .eq("org_id", orgId)
    .not("ghost_approaching_at", "is", null)
    .in("status", [...OPEN_LEAD_STATUSES]);

  const byOwner = new Map<string, { target: MemberNotifyTarget; names: string[] }>();
  for (const lead of leads ?? []) {
    const owner =
      memberById(members, lead.assigned_setter_id) ?? memberById(members, lead.assigned_closer_id);
    if (!owner) continue;
    const current = byOwner.get(owner.userId) ?? { target: owner, names: [] };
    current.names.push(lead.first_name ?? "a lead");
    byOwner.set(owner.userId, current);
  }
  for (const group of byOwner.values()) {
    if (minutesIntoWorkingDay(now, group.target.hours) === null) continue;
    if ((minutesIntoWorkingDay(now, group.target.hours) ?? 99) > DAILY_BRIEF_WINDOW_MINUTES) continue;
    const copy = ghostDigestCopy(group.names.length);
    const day = localDateKey(now, group.target.hours.timeZone);
    await offerToMember(db, {
      target: group.target,
      now,
      input: {
        orgId,
        eventType: "approaching_ghost",
        channel: "email",
        subjectKind: "lead",
        subjectIds: [],
        title: copy.title,
        body: copy.body,
        href: notificationHref("/app/cases"),
        dedupeKey: `approaching_ghost:email:${group.target.userId}:${day}`,
      },
    });
  }
}

async function observeDrafts(
  db: GhlDb,
  members: MemberNotifyTarget[],
  managers: MemberNotifyTarget[],
  orgId: string,
  staleDays: number,
  now: Date
) {
  const { data: drafts } = await db
    .from("follow_up_drafts")
    .select("id, lead_id, expires_at, status, created_at")
    .eq("org_id", orgId)
    .eq("status", "pending");
  const halfMs = (staleDays / 2) * 24 * 60 * 60 * 1000;
  const fullMs = staleDays * 24 * 60 * 60 * 1000;

  for (const draft of drafts ?? []) {
    const age = now.getTime() - Date.parse(draft.created_at);
    const { data: lead } = await db
      .from("leads")
      .select("id, first_name, assigned_setter_id, assigned_closer_id")
      .eq("id", draft.lead_id)
      .maybeSingle();
    if (!lead) continue;
    const approver =
      memberById(members, lead.assigned_setter_id) ?? memberById(members, lead.assigned_closer_id);
    const href = notificationHref(`/app/follow-ups/${draft.id}`);

    if (age >= halfMs && !(await alreadyStepped(db, orgId, "pending_draft", draft.id, 1))) {
      const copy = pendingDraftCopy(lead.first_name, false);
      const targets = approver ? [approver] : managers;
      for (const target of targets) {
        await offerToMember(db, {
          target,
          now,
          input: {
            orgId,
            eventType: "pending_draft",
            channel: "push",
            subjectKind: "draft",
            subjectIds: [draft.id],
            title: copy.title,
            body: copy.body,
            href,
            dedupeKey: `pending_draft:1:${target.userId}:${draft.id}`,
            escalationStep: 1,
          },
        });
      }
      await markEscalation(db, orgId, "pending_draft", draft.id, 1);
    }

    if (age >= fullMs && !(await alreadyStepped(db, orgId, "pending_draft", draft.id, 2))) {
      const copy = pendingDraftCopy(lead.first_name, true);
      for (const target of managers) {
        await offerToMember(db, {
          target,
          now,
          isEscalationToAdmin: true,
          input: {
            orgId,
            eventType: "pending_draft",
            channel: "push",
            subjectKind: "draft",
            subjectIds: [draft.id],
            title: copy.title,
            body: copy.body,
            href,
            dedupeKey: `pending_draft:2:${target.userId}:${draft.id}`,
            escalationStep: 2,
          },
        });
      }
      await markEscalation(db, orgId, "pending_draft", draft.id, 2);
    }
  }
}

async function observeCalls(db: GhlDb, members: MemberNotifyTarget[], orgId: string, now: Date) {
  const from = now.toISOString();
  const until = new Date(now.getTime() + CALL_SOON_MS).toISOString();
  const { data: calls } = await db
    .from("calls")
    .select("id, lead_id, scheduled_at, occurred_at, ran_by_member_id, outcome")
    .eq("org_id", orgId)
    .is("occurred_at", null)
    .is("outcome", null)
    .gte("scheduled_at", from)
    .lte("scheduled_at", until);

  for (const call of calls ?? []) {
    const { data: lead } = await db
      .from("leads")
      .select("id, first_name, assigned_closer_id")
      .eq("id", call.lead_id)
      .maybeSingle();
    if (!lead) continue;
    const closer =
      memberById(members, lead.assigned_closer_id) ?? memberById(members, call.ran_by_member_id);
    if (!closer) continue;
    if (!isWithinWorkingHours(now, closer.hours)) {
      const next = nextWorkingStart(now, closer.hours);
      if (!call.scheduled_at || next.getTime() >= Date.parse(call.scheduled_at)) continue;
    }
    const copy = callSoonCopy(lead.first_name);
    await offerToMember(db, {
      target: closer,
      now,
      input: {
        orgId,
        eventType: "call_starting_soon",
        channel: "push",
        subjectKind: "call",
        subjectIds: [call.id],
        title: copy.title,
        body: copy.body,
        href: notificationHref(`/app/cases/${lead.id}/brief`),
        dedupeKey: `call_starting_soon:${closer.userId}:${call.id}`,
      },
    });
  }
}

async function observeUnmatched(db: GhlDb, managers: MemberNotifyTarget[], orgId: string, now: Date) {
  const { data: rows } = await db
    .from("unmatched_transcripts")
    .select("id, created_at")
    .eq("org_id", orgId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const count = rows?.length ?? 0;
  if (count === 0) {
    await clearEscalation(db, orgId, "unmatched_transcript", orgId);
    return;
  }
  const oldest = rows?.[0]?.created_at ? now.getTime() - Date.parse(rows[0].created_at) : 0;
  const escalate = count >= UNMATCHED_ESCALATE_COUNT || oldest >= UNMATCHED_ESCALATE_AGE_MS;
  const copy = unmatchedCopy(count, escalate);
  const href = notificationHref("/app/settings/integrations");

  if (escalate && !(await alreadyStepped(db, orgId, "unmatched_transcript", orgId, 2))) {
    for (const target of managers) {
      await offerToMember(db, {
        target,
        now,
        isEscalationToAdmin: true,
        input: {
          orgId,
          eventType: "unmatched_transcript",
          channel: "push",
          subjectKind: "org",
          subjectIds: (rows ?? []).map((row) => row.id),
          title: copy.title,
          body: copy.body,
          href,
          dedupeKey: `unmatched_transcript:2:${target.userId}`,
          escalationStep: 2,
        },
      });
    }
    await markEscalation(db, orgId, "unmatched_transcript", orgId, 2);
    return;
  }

  for (const target of managers) {
    if (minutesIntoWorkingDay(now, target.hours) === null) continue;
    if ((minutesIntoWorkingDay(now, target.hours) ?? 99) > DAILY_BRIEF_WINDOW_MINUTES) continue;
    const day = localDateKey(now, target.hours.timeZone);
    await offerToMember(db, {
      target,
      now,
      input: {
        orgId,
        eventType: "unmatched_transcript",
        channel: "email",
        subjectKind: "org",
        subjectIds: (rows ?? []).map((row) => row.id),
        title: copy.title,
        body: copy.body,
        href,
        dedupeKey: `unmatched_transcript:1:email:${target.userId}:${day}`,
        escalationStep: 1,
      },
    });
  }
}

async function offerEmergency(
  db: GhlDb,
  args: {
    managers: MemberNotifyTarget[];
    orgId: string;
    sms: boolean;
    now: Date;
    eventType: "ingestion_stalled" | "crm_broken";
    copy: { title: string; body: string };
  }
) {
  const href = notificationHref("/app/settings/integrations");
  if (!(await alreadyStepped(db, args.orgId, args.eventType, args.orgId, 1))) {
    for (const target of args.managers) {
      await offerToMember(db, {
        target,
        now: args.now,
        isEscalationToAdmin: true,
        input: {
          orgId: args.orgId,
          eventType: args.eventType,
          channel: "push",
          subjectKind: "org",
          subjectIds: [args.orgId],
          title: args.copy.title,
          body: args.copy.body,
          href,
          dedupeKey: `${args.eventType}:1:${target.userId}`,
          isEmergency: true,
        },
      });
    }
    await offerDaConsole(db, {
      orgId: args.orgId,
      eventType: args.eventType,
      subjectKind: "org",
      subjectIds: [args.orgId],
      title: args.copy.title,
      body: args.copy.body,
      href,
      dedupeKey: `${args.eventType}:da_console:${args.orgId}`,
      isEmergency: true,
    });
    await markEscalation(db, args.orgId, args.eventType, args.orgId, 1);
    return;
  }

  if (!args.sms) return;
  if (await alreadyStepped(db, args.orgId, args.eventType, args.orgId, 2)) return;
  const first = await escalationFiredAt(db, args.orgId, args.eventType, args.orgId, 1);
  if (!first || args.now.getTime() - first.getTime() < SMS_EMERGENCY_DELAY_MS) return;
  for (const target of args.managers) {
    await offerToMember(db, {
      target,
      now: args.now,
      isEscalationToAdmin: true,
      orgSmsEnabled: true,
      forceChannel: true,
      input: {
        orgId: args.orgId,
        eventType: args.eventType,
        channel: "sms",
        subjectKind: "org",
        subjectIds: [args.orgId],
        title: args.copy.title,
        body: args.copy.body,
        href,
        dedupeKey: `${args.eventType}:2:sms:${target.userId}`,
        isEmergency: true,
        escalationStep: 2,
      },
    });
  }
  await markEscalation(db, args.orgId, args.eventType, args.orgId, 2);
}

async function observeIngestion(
  db: GhlDb,
  managers: MemberNotifyTarget[],
  orgId: string,
  sms: boolean,
  now: Date
) {
  const health = await loadOrgIngestionHealth(db, orgId);
  if (!health.stale) {
    await clearEscalation(db, orgId, "ingestion_stalled", orgId);
    return;
  }
  await offerEmergency(db, {
    managers,
    orgId,
    sms,
    now,
    eventType: "ingestion_stalled",
    copy: ingestionStalledCopy(),
  });
}

async function observeCrm(
  db: GhlDb,
  managers: MemberNotifyTarget[],
  orgId: string,
  sms: boolean,
  now: Date
) {
  const { data: connection } = await db
    .from("ghl_connections")
    .select("status")
    .eq("org_id", orgId)
    .maybeSingle();
  if (connection?.status !== "broken") {
    await clearEscalation(db, orgId, "crm_broken", orgId);
    return;
  }
  await offerEmergency(db, {
    managers,
    orgId,
    sms,
    now,
    eventType: "crm_broken",
    copy: crmBrokenCopy(),
  });
}

async function observeAdoption(db: GhlDb, managers: MemberNotifyTarget[], orgId: string, now: Date) {
  if (managers.length === 0) return;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: managers[0].hours.timeZone,
    weekday: "short",
  }).format(now);
  if (weekday !== "Mon") return;
  const { data: watch } = await db.rpc("adoption_watch", { p_org_id: orgId });
  const alarms = Array.isArray((watch as { alarms?: unknown } | null)?.alarms)
    ? ((watch as { alarms: unknown[] }).alarms)
    : [];
  if (alarms.length === 0) return;
  const copy = adoptionCopy(alarms.length);
  for (const target of managers) {
    if ((minutesIntoWorkingDay(now, target.hours) ?? 99) > DAILY_BRIEF_WINDOW_MINUTES) continue;
    const day = localDateKey(now, target.hours.timeZone);
    await offerToMember(db, {
      target,
      now,
      input: {
        orgId,
        eventType: "adoption_warning",
        channel: "email",
        subjectKind: "org",
        subjectIds: [orgId],
        title: copy.title,
        body: copy.body,
        href: notificationHref("/app/reporting/adoption"),
        dedupeKey: `adoption_warning:email:${target.userId}:${day}`,
      },
    });
  }
  const day = localDateKey(now, managers[0].hours.timeZone);
  await offerDaConsole(db, {
    orgId,
    eventType: "adoption_warning",
    subjectKind: "org",
    subjectIds: [orgId],
    title: copy.title,
    body: copy.body,
    href: notificationHref("/app/reporting/adoption"),
    dedupeKey: `adoption_warning:da_console:${orgId}:${day}`,
  });
}

async function observeDailyBriefs(db: GhlDb, members: MemberNotifyTarget[], orgId: string, now: Date) {
  for (const member of members) {
    const into = minutesIntoWorkingDay(now, member.hours);
    if (into === null || into > DAILY_BRIEF_WINDOW_MINUTES) continue;
    const day = localDateKey(now, member.hours.timeZone);
    const { data: existing } = await db
      .from("notification_digest_log")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", member.userId)
      .eq("kind", "daily_brief")
      .eq("sent_on", day)
      .maybeSingle();
    if (existing) continue;

    const items = await collectDailyBriefItems(db, orgId, member, now);
    if (items.length === 0) {
      await db.from("notification_digest_log").insert({
        org_id: orgId,
        user_id: member.userId,
        kind: "daily_brief",
        sent_on: day,
      });
      continue;
    }

    await offerToMember(db, {
      target: member,
      now,
      input: {
        orgId,
        eventType: "daily_brief",
        channel: "email",
        subjectKind: "digest",
        subjectIds: [],
        title: "Today in Vistrial",
        body: items.map((item) => item.text).join(" · "),
        href: notificationHref("/app/queue"),
        dedupeKey: `daily_brief:email:${member.userId}:${day}`,
      },
    });
    await db.from("notification_digest_log").insert({
      org_id: orgId,
      user_id: member.userId,
      kind: "daily_brief",
      sent_on: day,
    });
  }
}

export async function observeJobs(db: GhlDb, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - JOB_FAILURE_LOOKBACK_MS).toISOString();
  const { data: failed } = await db
    .from("reporting_job_runs")
    .select("id, job_kind, finished_at")
    .eq("status", "failed")
    .gte("finished_at", since);

  for (const run of failed ?? []) {
    const copy = jobFailureCopy(run.job_kind);
    await offerDaConsole(db, {
      orgId: null,
      eventType: "job_failure",
      subjectKind: "job",
      subjectIds: [run.id],
      title: copy.title,
      body: copy.body,
      href: notificationHref("/app/ops"),
      dedupeKey: `job_failure:da_console:${run.id}`,
    });
  }

  const { data: ghost } = await db
    .from("ghost_detector_runs")
    .select("ran_at")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastGhost = ghost?.ran_at ? Date.parse(ghost.ran_at) : 0;
  if (!lastGhost || now.getTime() - lastGhost > GHOST_DETECTOR_STALE_MS) {
    const copy = jobFailureCopy("ghost detection");
    const day = localDateKey(now, "UTC");
    await offerDaConsole(db, {
      orgId: null,
      eventType: "job_failure",
      subjectKind: "job",
      subjectIds: [],
      title: copy.title,
      body: copy.body,
      href: notificationHref("/app/ops"),
      dedupeKey: `job_failure:da_console:ghost:${day}`,
    });
  }
}

export async function runNotificationObserve(db: GhlDb, now = new Date()): Promise<{ orgs: number }> {
  const { data: orgs } = await db.from("organizations").select("id");
  for (const org of orgs ?? []) {
    await observeOrg(db, org.id, now);
  }
  await observeJobs(db, now);
  return { orgs: orgs?.length ?? 0 };
}
