import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import type { GhlDb } from "@/lib/ghl/tokens";
import { emailStaff, queuePortalNotice } from "@/lib/portal/notices";

/**
 * Onboarding notices. Everything goes through the existing notification
 * routes: Owners get notices on their notifications page and by email (as
 * they chose, instant or a daily summary); the team gets email. Notices are
 * grouped per workspace, limited, and never mention a lead.
 */

type Db = SupabaseClient;

type Event = { id: string; org_id: string; audience: "owner" | "staff"; kind: string; stage_key: string | null; detail: Record<string, unknown> | null; created_at: string };

const URGENT_OWNER = new Set(["go_live_approved", "live", "messaging_status", "moved_onboarding", "moved_paused", "moved_cancelled", "resumed", "needs_attention"]);
const URGENT_STAFF = new Set(["stage_blocked", "stage_reverted", "owner_confirmed", "sample_problem", "sample_failed"]);
const OWNER_GAP_MS = 60 * 60_000;
const STAFF_GAP_MS = 30 * 60_000;

function stageName(labels: Map<string, { customer: string; staff: string }>, key: string | null, who: "customer" | "staff"): string {
  if (!key) return "setup";
  return labels.get(key)?.[who] ?? key.replaceAll("_", " ");
}

function agentName(value: unknown): string {
  return typeof value === "string" && value in AGENTS ? AGENTS[value as LiveAgentId].name : "An agent";
}

/** One line per event, for the Owner. Plain words, no lead content, no contact details. */
export function ownerLine(event: Pick<Event, "kind" | "stage_key" | "detail">, label: (key: string | null) => string): string | null {
  const detail = event.detail ?? {};
  switch (event.kind) {
    case "needs_you":
      return `Ready for you: ${label(event.stage_key)}.`;
    case "needs_attention":
      return `${label(event.stage_key)} needs your attention.`;
    case "messaging_status":
      return detail.status === "approved"
        ? "The carriers approved your texting registration."
        : detail.status === "rejected"
          ? "The carriers asked for a change to your texting registration. Open setup to see what to fix."
          : detail.status === "pending"
            ? "Your texting registration was submitted. Approval usually takes 1 to 3 business days."
            : null;
    case "email_records_ready":
      return "The email records are ready for you to add.";
    case "go_live_approved":
      return "Your team approved going live. Your agents are being switched on one at a time.";
    case "agent_on":
      return detail.agent === "sentry" && detail.stage === "watch"
        ? `${agentName("sentry")} is watching. It tells nobody for now, so you can see what it would have flagged.`
        : detail.agent === "sentry"
          ? `${agentName("sentry")} alerts are now on.`
          : detail.agent === "relay"
            ? `${agentName("relay")} is drafting follow-ups. Nothing is sent unless someone approves it.`
            : `${agentName(detail.agent)} is now on.`;
    case "live":
      return "You are live.";
    case "moved_onboarding":
      return "Your team moved your workspace back to setup for a moment, and switched the agents off. They will tell you why.";
    case "moved_paused":
      return "Your team paused your workspace. Nothing runs while it is paused.";
    case "moved_cancelled":
      return "Your setup is on hold. Your team will be in touch.";
    case "resumed":
      return "Your workspace is running again.";
    default:
      return null;
  }
}

export function staffLine(event: Pick<Event, "kind" | "stage_key" | "detail">, label: (key: string | null) => string): string {
  const detail = event.detail ?? {};
  switch (event.kind) {
    case "stage_blocked":
      return `Blocked: ${label(event.stage_key)}.${typeof detail.reason === "string" ? ` ${detail.reason}` : ""}`;
    case "stage_reverted":
      return `Moved back: ${label(event.stage_key)} is no longer done.${typeof detail.reason === "string" ? ` ${detail.reason}` : ""}`;
    case "customer_done":
      return `The customer finished: ${label(event.stage_key)}.`;
    case "owner_confirmed":
      return "The Owner confirmed they are ready. Review the go-live checks and approve.";
    case "approach_change_requested":
      return "The Owner asked for changes to the approach.";
    case "crm_help_requested":
      return `The Owner asked for help connecting their CRM${typeof detail.crm === "string" && detail.crm ? ` (${detail.crm})` : ""}.`;
    case "registration_saved":
      return "The Owner saved texting registration details. Get the tax ID from them directly, then submit in the CRM.";
    case "email_help_requested":
      return "The Owner asked the team to set up the email domain.";
    case "sample_problem":
      return "The Owner reported a problem with the sample lead test.";
    case "sample_failed":
      return "The sample lead test stopped part way.";
    case "channel_changed":
      return `${detail.channel === "texting" ? "Texting" : "Email"} was switched ${detail.enabled ? "on" : "off"} for this workspace.`;
    default:
      return `${event.kind.replaceAll("_", " ")}.`;
  }
}

async function stageLabels(db: Db): Promise<Map<string, { customer: string; staff: string }>> {
  const { data } = await db.from("onboarding_stage_definitions").select("key, customer_label, staff_label");
  return new Map(((data ?? []) as Array<{ key: string; customer_label: string; staff_label: string }>).map((row) => [row.key, { customer: row.customer_label, staff: row.staff_label }]));
}

async function owners(db: Db, orgId: string): Promise<string[]> {
  const { data } = await db.from("org_members").select("id").eq("org_id", orgId).eq("seat", "customer").eq("role", "owner").eq("active", true);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function lastSent(db: Db, orgId: string, audience: "owner" | "staff", kind: string): Promise<number> {
  const { data } = await db
    .from("onboarding_reminders")
    .select("sent_at")
    .eq("org_id", orgId)
    .eq("audience", audience)
    .eq("kind", kind)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = (data as { sent_at?: string } | null)?.sent_at;
  return at ? Date.parse(at) : 0;
}

async function orgName(db: Db, orgId: string): Promise<string> {
  const { data } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return String((data as { name?: string } | null)?.name ?? "A workspace");
}

/** Sends what is waiting, grouped per workspace and audience. */
export async function deliverOnboardingEvents(db: Db): Promise<{ owner: number; staff: number }> {
  const { data } = await db.from("onboarding_events").select("*").is("processed_at", null).order("created_at").limit(500);
  const events = (data ?? []) as Event[];
  if (!events.length) return { owner: 0, staff: 0 };
  const labels = await stageLabels(db);
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const key = `${event.org_id}:${event.audience}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  let ownerSent = 0;
  let staffSent = 0;
  for (const [key, group] of groups) {
    const [orgId, audience] = key.split(":") as [string, "owner" | "staff"];
    const urgent = group.some((event) => (audience === "owner" ? URGENT_OWNER : URGENT_STAFF).has(event.kind));
    const gap = audience === "owner" ? OWNER_GAP_MS : STAFF_GAP_MS;
    if (!urgent && Date.now() - (await lastSent(db, orgId, audience, "update")) < gap) continue;

    const ids = group.map((event) => event.id);
    if (audience === "owner") {
      const lines = [...new Set(group.map((event) => ownerLine(event, (k) => stageName(labels, k, "customer"))).filter((line): line is string => Boolean(line)))];
      if (lines.length) {
        const body = lines.length === 1 ? lines[0]! : `${lines.length} updates on your setup. Open Vistrial to see them.`;
        for (const memberId of await owners(db, orgId)) {
          await queuePortalNotice({
            db: db as unknown as GhlDb,
            orgId,
            memberId,
            eventType: "onboarding",
            title: lines.some((line) => line === "You are live.") ? "You are live" : "Your Vistrial setup",
            body,
            path: "/app/onboarding",
            dedupeKey: `onboarding:${orgId}:${memberId}:${ids[0]}`,
          });
        }
        ownerSent += 1;
      }
    } else {
      const lines = [...new Set(group.map((event) => staffLine(event, (k) => stageName(labels, k, "staff"))))];
      const name = await orgName(db, orgId);
      await emailStaff({
        orgId,
        subject: `${name}: onboarding ${urgent ? "needs you" : "update"}`,
        lines,
        href: `/app/team/onboarding/${orgId}`,
        ctaLabel: "Open the workbench",
        idempotencyKey: `onboarding-staff:${orgId}:${ids[0]}`,
      });
      staffSent += 1;
    }
    await db.from("onboarding_reminders").insert({ org_id: orgId, audience, kind: "update", stage_keys: group.map((event) => event.stage_key).filter(Boolean) });
    await db.from("onboarding_events").update({ processed_at: new Date().toISOString() }).in("id", ids);
  }
  return { owner: ownerSent, staff: staffSent };
}

type Settings = {
  onboarding_invite_reminder_days: number[];
  onboarding_nudge_every_days: number;
  onboarding_nudge_max_per_step: number;
  onboarding_stuck_customer_days: number;
};

/**
 * Gentle reminders: one grouped nudge to the Owner every few days, a few per
 * step at most, only for steps still waiting on them (acting on a step stops
 * them); invitation reminders to staff on the set days; staff told when a
 * check-in is due or a workspace gets stuck.
 */
export async function sendOnboardingReminders(db: Db, now = Date.now()): Promise<{ nudges: number; invites: number; checkins: number; stuck: number }> {
  const { data: s } = await db
    .from("staff_support_settings")
    .select("onboarding_invite_reminder_days, onboarding_nudge_every_days, onboarding_nudge_max_per_step, onboarding_stuck_customer_days")
    .eq("id", true)
    .maybeSingle();
  const settings = (s ?? { onboarding_invite_reminder_days: [3, 7], onboarding_nudge_every_days: 3, onboarding_nudge_max_per_step: 3, onboarding_stuck_customer_days: 5 }) as Settings;
  const labels = await stageLabels(db);
  let nudges = 0;
  let invites = 0;
  let checkins = 0;
  let stuck = 0;

  const { data: headers } = await db
    .from("workspace_onboarding_status")
    .select("org_id, phase, stuck, stuck_reason")
    .in("phase", ["setup", "ready_for_review"])
    .limit(1000);
  for (const header of (headers ?? []) as Array<{ org_id: string; phase: string; stuck: boolean; stuck_reason: string | null }>) {
    const orgId = header.org_id;
    // Owner nudge.
    const every = settings.onboarding_nudge_every_days * 86_400_000;
    if (settings.onboarding_nudge_max_per_step > 0 && now - (await lastSent(db, orgId, "owner", "nudge")) >= every) {
      const { data: waiting } = await db
        .from("workspace_onboarding_stages")
        .select("stage_key, waiting_since")
        .eq("org_id", orgId)
        .eq("status", "waiting_on_customer")
        .lte("waiting_since", new Date(now - every).toISOString());
      const keys = ((waiting ?? []) as Array<{ stage_key: string }>).map((row) => row.stage_key);
      if (keys.length) {
        const { data: past } = await db.from("onboarding_reminders").select("stage_keys").eq("org_id", orgId).eq("audience", "owner").eq("kind", "nudge");
        const counts = new Map<string, number>();
        for (const row of (past ?? []) as Array<{ stage_keys: string[] }>) for (const key of row.stage_keys) counts.set(key, (counts.get(key) ?? 0) + 1);
        const due = keys.filter((key) => (counts.get(key) ?? 0) < settings.onboarding_nudge_max_per_step);
        if (due.length) {
          const names = due.map((key) => stageName(labels, key, "customer"));
          for (const memberId of await owners(db, orgId)) {
            await queuePortalNotice({
              db: db as unknown as GhlDb,
              orgId,
              memberId,
              eventType: "onboarding",
              title: "A few setup steps are waiting for you",
              body: names.length === 1 ? `${names[0]} is ready when you are.` : `${names.slice(0, 3).join(", ")}${names.length > 3 ? ", and more" : ""} are ready when you are.`,
              path: "/app/onboarding",
              dedupeKey: `onboarding-nudge:${orgId}:${memberId}:${new Date(now).toISOString().slice(0, 10)}`,
            });
          }
          await db.from("onboarding_reminders").insert({ org_id: orgId, audience: "owner", kind: "nudge", stage_keys: due });
          nudges += 1;
        }
      }
    }

    // Unaccepted Owner invitation: remind staff on the set days.
    const { data: invite } = await db
      .from("org_invites")
      .select("expires_at")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invite) {
      const sentAt = Date.parse((invite as { expires_at: string }).expires_at) - 7 * 86_400_000;
      const days = Math.floor((now - sentAt) / 86_400_000);
      const { data: details } = await db.from("onboarding_staff_details").select("owner_invite_reminded_days").eq("org_id", orgId).maybeSingle();
      const done = new Set(((details as { owner_invite_reminded_days?: number[] } | null)?.owner_invite_reminded_days ?? []).map(Number));
      const step = settings.onboarding_invite_reminder_days.filter((day) => days >= day && !done.has(day)).pop();
      if (step !== undefined) {
        await emailStaff({
          orgId,
          subject: `${await orgName(db, orgId)}: the Owner has not accepted their invitation`,
          lines: [`It was sent ${days} day${days === 1 ? "" : "s"} ago. Resend it, check the email address, or contact them.`],
          href: `/app/team/onboarding/${orgId}`,
          ctaLabel: "Open the workbench",
          idempotencyKey: `onboarding-invite:${orgId}:${step}:${sentAt}`,
        });
        await db
          .from("onboarding_staff_details")
          .update({ owner_invite_reminded_days: [...done, ...settings.onboarding_invite_reminder_days.filter((day) => days >= day)] })
          .eq("org_id", orgId);
        invites += 1;
      }
    }

    // Stuck: tell staff once a day.
    if (header.stuck && now - (await lastSent(db, orgId, "staff", "stuck")) >= 86_400_000) {
      await emailStaff({
        orgId,
        subject: `${await orgName(db, orgId)}: onboarding is stuck`,
        lines: [header.stuck_reason ?? "A setup step is blocked."],
        href: `/app/team/onboarding/${orgId}`,
        ctaLabel: "Open the workbench",
        idempotencyKey: `onboarding-stuck:${orgId}:${new Date(now).toISOString().slice(0, 10)}`,
      });
      await db.from("onboarding_reminders").insert({ org_id: orgId, audience: "staff", kind: "stuck" });
      stuck += 1;
    }
  }

  // Check-ins due.
  const { data: due } = await db
    .from("onboarding_checkins")
    .select("id, org_id, day")
    .eq("status", "scheduled")
    .lte("due_at", new Date(now).toISOString())
    .limit(200);
  for (const checkin of (due ?? []) as Array<{ id: string; org_id: string; day: number }>) {
    const { count } = await db
      .from("onboarding_reminders")
      .select("id", { count: "exact", head: true })
      .eq("org_id", checkin.org_id)
      .eq("kind", "checkin_due")
      .contains("stage_keys", [`day_${checkin.day}`]);
    if (count) continue;
    await emailStaff({
      orgId: checkin.org_id,
      subject: `${await orgName(db, checkin.org_id)}: day ${checkin.day} check-in is due`,
      lines: ["The checklist is filled in from what happened in the workspace. Add your notes and mark it done."],
      href: `/app/team/onboarding/${checkin.org_id}#checkins`,
      ctaLabel: "Open the check-in",
      idempotencyKey: `onboarding-checkin:${checkin.id}`,
    });
    await db.from("onboarding_reminders").insert({ org_id: checkin.org_id, audience: "staff", kind: "checkin_due", stage_keys: [`day_${checkin.day}`] });
    checkins += 1;
  }
  return { nudges, invites, checkins, stuck };
}
