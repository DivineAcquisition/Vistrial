import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import {
  itemPreview,
  itemTitle,
  MAX_LEADS_PER_ITEM,
  messageChannel,
  noShowDraft,
  nudgeText,
  quietLeadDraft,
  type QueueDraft,
  type VoiceBits,
} from "@/lib/home/queue";
import type { NewQueueItem, ProducerContext } from "@/lib/home/areas/producer-types";
import { requireConfig } from "@/lib/config/server";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A lead quiet longer than this is past saving with a check-in; it is left alone. */
const QUIET_MAX_DAYS = 30;

/** The workspace's windows (response section of its configuration). */
type Windows = {
  /** A lead with no activity this long counts as gone quiet. */
  quietAfterHours: number;
  /** How long after a no-show a rebooking message still makes sense. */
  noShowDays: number;
  /** New leads older than this are not nudged about; the list already shows them. */
  untouchedDays: number;
  /** The first-touch window a new lead is measured against. */
  firstTouchMinutes: number;
};
/** A lead gets at most one item of a kind in this window, whatever happened to it. */
const REPEAT_WINDOW_DAYS = 7;
const CANDIDATE_LIMIT = 200;

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  offer_name: string | null;
  assigned_setter_id: string | null;
  assigned_closer_id: string | null;
  opted_in_at: string;
  last_touch_at: string | null;
};

const LEAD_COLUMNS =
  "id, first_name, last_name, email, phone, offer_name, assigned_setter_id, assigned_closer_id, opted_in_at, last_touch_at";

function nameOf(lead: Pick<LeadRow, "first_name" | "last_name" | "email">): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || lead.email || "Unnamed lead";
}

function assigneeOf(lead: LeadRow): string | null {
  return lead.assigned_setter_id ?? lead.assigned_closer_id ?? null;
}

async function recentlyHandled(db: GhlDb, orgId: string, kind: string, now: Date): Promise<Set<string>> {
  const { data } = await db
    .from("approval_items")
    .select("lead_ids, status, created_at")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .or(`status.in.(pending,running,failed),created_at.gte.${new Date(now.getTime() - REPEAT_WINDOW_DAYS * DAY).toISOString()}`);
  return new Set((data ?? []).flatMap((row) => row.lead_ids ?? []));
}

async function loadVoice(db: GhlDb, orgId: string): Promise<VoiceBits> {
  const { data } = await db
    .from("org_voice_profiles")
    .select("use_greeting, greeting_text, use_signoff, signoff_text")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    greeting: data?.use_greeting ? (data.greeting_text ?? null) : null,
    signoff: data?.use_signoff ? (data.signoff_text ?? null) : null,
    useGreeting: data?.use_greeting ?? true,
  };
}

/** One item per assignee, split so no single decision covers too many leads. */
function byAssignee(leads: LeadRow[]): Array<[string | null, LeadRow[]]> {
  const groups = new Map<string | null, LeadRow[]>();
  for (const lead of leads) {
    const key = assigneeOf(lead);
    groups.set(key, [...(groups.get(key) ?? []), lead]);
  }
  const out: Array<[string | null, LeadRow[]]> = [];
  for (const [assignee, group] of groups) {
    for (let index = 0; index < group.length; index += MAX_LEADS_PER_ITEM) {
      out.push([assignee, group.slice(index, index + MAX_LEADS_PER_ITEM)]);
    }
  }
  return out;
}

function messageItems(
  kind: "quiet_lead_follow_up" | "no_show_rebook",
  leads: LeadRow[],
  draftFor: (lead: LeadRow, channel: "sms" | "email") => { subject: string | null; body: string },
  extra: { reason: (leads: LeadRow[]) => string; callIds?: Map<string, string> }
): NewQueueItem[] {
  const items: NewQueueItem[] = [];
  for (const [assignee, group] of byAssignee(leads)) {
    const drafts: QueueDraft[] = [];
    const included: LeadRow[] = [];
    for (const lead of group) {
      const channel = messageChannel(lead);
      if (!channel) continue;
      const draft = draftFor(lead, channel);
      drafts.push({
        leadId: lead.id,
        leadName: nameOf(lead),
        channel,
        subject: draft.subject,
        body: draft.body,
        callId: extra.callIds?.get(lead.id) ?? null,
      });
      included.push(lead);
    }
    if (!drafts.length) continue;
    items.push({
      kind,
      actionType: kind,
      title: itemTitle(kind, drafts.length),
      preview: itemPreview(drafts),
      reason: extra.reason(included),
      assignedMemberId: assignee,
      drafts,
    });
  }
  return items;
}

function daysAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY));
}

function spanText(days: number[]): string {
  const low = Math.min(...days);
  const high = Math.max(...days);
  if (low === high) return `${low} ${low === 1 ? "day" : "days"}`;
  return `${low} to ${high} days`;
}

/**
 * Sales finds three kinds of work: leads gone quiet, appointments missed, and
 * new leads nobody has answered inside the response window. It only drafts;
 * whether anything is sent is decided by the workspace's approval settings.
 */
export async function salesProducer(context: ProducerContext): Promise<NewQueueItem[]> {
  const { db, org, gate, now } = context;
  const items: NewQueueItem[] = [];
  const mode = (actionType: string) => gate.choice(actionType).mode;

  // No configuration, no drafts: the stop and its reason are recorded for the team.
  const configured = await requireConfig(db, org.id, "approval_queue");
  if (!configured.ok) return [];
  const values = configured.config.values;
  const windows: Windows = {
    quietAfterHours: Number(values["response.quiet_lead_hours"]),
    noShowDays: Number(values["response.no_show_window_days"]),
    untouchedDays: Number(values["response.untouched_window_days"]),
    firstTouchMinutes: Number(values["response.first_touch_minutes"]),
  };

  if (mode("quiet_lead_follow_up") !== "off") {
    items.push(...(await quietLeads(db, org.id, now, windows)));
  }
  if (mode("no_show_rebook") !== "off") {
    items.push(...(await noShows(db, org.id, now, windows)));
  }
  if (mode("setter_nudge") !== "off") {
    items.push(...(await untouchedLeads(db, org.id, now, windows)));
  }
  return items;
}

async function quietLeads(db: GhlDb, orgId: string, now: Date, windows: Windows): Promise<NewQueueItem[]> {
  const [handled, voice, { data: leads }] = await Promise.all([
    recentlyHandled(db, orgId, "quiet_lead_follow_up", now),
    loadVoice(db, orgId),
    db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("org_id", orgId)
      .eq("is_test", false)
      .in("status", ["working", "follow_up", "objection_hold", "ghost"])
      .lte("last_touch_at", new Date(now.getTime() - windows.quietAfterHours * HOUR).toISOString())
      .gte("last_touch_at", new Date(now.getTime() - QUIET_MAX_DAYS * DAY).toISOString())
      .order("last_touch_at", { ascending: true })
      .limit(CANDIDATE_LIMIT),
  ]);
  const candidates = (leads ?? []).filter((lead) => !handled.has(lead.id));
  return messageItems(
    "quiet_lead_follow_up",
    candidates,
    (lead, channel) => quietLeadDraft({ firstName: lead.first_name, offerName: lead.offer_name, channel, voice }),
    {
      reason: (group) =>
        `No activity for ${spanText(group.map((lead) => daysAgo(lead.last_touch_at ?? lead.opted_in_at, now)))}.`,
    }
  );
}

async function noShows(db: GhlDb, orgId: string, now: Date, windows: Windows): Promise<NewQueueItem[]> {
  const { data: missed } = await db
    .from("calls")
    .select("id, lead_id, scheduled_at")
    .eq("org_id", orgId)
    .eq("outcome", "no_show")
    .gte("scheduled_at", new Date(now.getTime() - windows.noShowDays * DAY).toISOString())
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  if (!missed?.length) return [];

  // The newest miss per lead is the one to rebook.
  const latest = new Map<string, { id: string; scheduledAt: string }>();
  for (const call of missed) {
    if (call.scheduled_at && !latest.has(call.lead_id)) {
      latest.set(call.lead_id, { id: call.id, scheduledAt: call.scheduled_at });
    }
  }
  const leadIds = [...latest.keys()];
  const [handled, voice, { data: leads }, { data: later }] = await Promise.all([
    recentlyHandled(db, orgId, "no_show_rebook", now),
    loadVoice(db, orgId),
    db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("org_id", orgId)
      .eq("is_test", false)
      .in("id", leadIds)
      .not("status", "in", "(closed_won,closed_lost,call_booked)"),
    db
      .from("calls")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .in("lead_id", leadIds)
      .not("scheduled_at", "is", null),
  ]);
  const rebooked = new Set(
    (later ?? [])
      .filter((call) => {
        const miss = latest.get(call.lead_id);
        return miss && Date.parse(call.created_at) > Date.parse(miss.scheduledAt);
      })
      .map((call) => call.lead_id)
  );
  const candidates = (leads ?? []).filter((lead) => !handled.has(lead.id) && !rebooked.has(lead.id));
  return messageItems(
    "no_show_rebook",
    candidates,
    (lead, channel) => noShowDraft({ firstName: lead.first_name, channel, voice }),
    {
      reason: (group) => {
        if (group.length > 1) return `Missed their appointments in the last ${windows.noShowDays} days and have not rebooked.`;
        const days = daysAgo(latest.get(group[0].id)?.scheduledAt ?? now.toISOString(), now);
        return days === 0 ? "Missed their appointment today." : `Missed their appointment ${spanText([days])} ago.`;
      },
      callIds: new Map([...latest.entries()].map(([leadId, call]) => [leadId, call.id])),
    }
  );
}

async function untouchedLeads(db: GhlDb, orgId: string, now: Date, windows: Windows): Promise<NewQueueItem[]> {
  const windowMinutes = windows.firstTouchMinutes;
  const [handled, { data: leads }, { data: members }] = await Promise.all([
    recentlyHandled(db, orgId, "untouched_lead_nudge", now),
    db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("org_id", orgId)
      .eq("is_test", false)
      .eq("status", "new")
      .is("last_touch_at", null)
      .is("first_human_touch_at", null)
      .lte("opted_in_at", new Date(now.getTime() - windowMinutes * 60_000).toISOString())
      .gte("opted_in_at", new Date(now.getTime() - windows.untouchedDays * DAY).toISOString())
      .order("opted_in_at", { ascending: true })
      .limit(CANDIDATE_LIMIT),
    db.from("org_members").select("id, display_name").eq("org_id", orgId),
  ]);
  const names = new Map((members ?? []).map((member) => [member.id, member.display_name]));
  const candidates = (leads ?? []).filter((lead) => !handled.has(lead.id));
  const items: NewQueueItem[] = [];
  for (const [assignee, group] of byAssignee(candidates)) {
    const drafts: QueueDraft[] = group.map((lead) => ({
      leadId: lead.id,
      leadName: nameOf(lead),
      channel: "task",
      subject: null,
      body: nudgeText({
        leadName: nameOf(lead),
        waitedMinutes: (now.getTime() - Date.parse(lead.opted_in_at)) / 60_000,
        windowMinutes,
      }),
    }));
    items.push({
      kind: "untouched_lead_nudge",
      actionType: "setter_nudge",
      title: itemTitle("untouched_lead_nudge", drafts.length, {
        assigneeName: assignee ? (names.get(assignee) ?? null) : null,
        windowMinutes,
      }),
      preview: drafts.map((draft) => draft.leadName).slice(0, 4).join(", ") + (drafts.length > 4 ? ` and ${drafts.length - 4} more` : ""),
      reason: assignee ? "Adds a task on each lead for the person assigned." : "Nobody is assigned. Adds a task on each lead.",
      assignedMemberId: assignee,
      drafts,
    });
  }
  return items;
}
