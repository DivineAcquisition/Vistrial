import "server-only";

import { loadConnection, type GhlDb } from "@/lib/ghl/tokens";
import { ghlError, ghlLog, ghlWarn } from "@/lib/ghl/log";
import {
  listCalendarEvents,
  listCalendars,
  listConversationMessages,
  searchContactsPage,
  searchConversationsPage,
  searchOpportunitiesPage,
  type HistoryContact,
} from "@/lib/ghl/history";
import { inboundTouchSummary, outboundTouchSummary } from "@/lib/ghl/message-meta";

async function consumeRate(db: GhlDb, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc("try_consume_ghl_rate", { p_org_id: orgId });
  if (error) return false;
  return data === true;
}

const TICK_MS = 45_000;

type Progress = {
  phase: string;
  contactPage?: number;
  opportunityStartAfter?: string | null;
  calendarIndex?: number;
  conversationAfter?: string | null;
};

function asProgress(value: unknown): Progress {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    phase: typeof row.phase === "string" ? row.phase : "contacts",
    contactPage: typeof row.contactPage === "number" ? row.contactPage : 1,
    opportunityStartAfter: typeof row.opportunityStartAfter === "string" ? row.opportunityStartAfter : null,
    calendarIndex: typeof row.calendarIndex === "number" ? row.calendarIndex : 0,
    conversationAfter: typeof row.conversationAfter === "string" ? row.conversationAfter : null,
  };
}

export async function runBaselineBackfill(db: GhlDb): Promise<{
  claimed: number;
  advanced: number;
  completed: number;
  failed: number;
}> {
  const { data: runId, error } = await db.rpc("claim_baseline_run");
  if (error) {
    ghlError("baseline.claim_failed", { error: error.message });
    return { claimed: 0, advanced: 0, completed: 0, failed: 1 };
  }
  if (!runId) return { claimed: 0, advanced: 0, completed: 0, failed: 0 };

  const { data: run } = await db.from("baseline_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) return { claimed: 1, advanced: 0, completed: 0, failed: 1 };

  const connection = await loadConnection(db, run.org_id);
  if (!connection?.location_id || connection.status !== "active") {
    await db.rpc("fail_baseline_run", {
      p_run_id: runId,
      p_error: "CRM connection is missing or not active",
    });
    return { claimed: 1, advanced: 0, completed: 0, failed: 1 };
  }

  const progress = asProgress(run.progress);
  if (progress.phase === "queued" || !run.started_at || progress.phase === "contacts" && progress.contactPage === 1) {
    if (progress.phase === "queued") {
      await db.from("baseline_leads").delete().eq("org_id", run.org_id);
      await db.from("baseline_touches").delete().eq("org_id", run.org_id);
      await db.from("baseline_calls").delete().eq("org_id", run.org_id);
      await db.from("baseline_revenue").delete().eq("org_id", run.org_id);
    }
  }

  const deadline = Date.now() + TICK_MS;
  try {
    const next = await advanceBackfill(db, {
      runId,
      orgId: run.org_id,
      locationId: connection.location_id,
      windowStart: run.window_start,
      windowEnd: run.window_end,
      progress,
      deadline,
      contactsSeen: run.contacts_seen,
      contactsDated: run.contacts_with_created_date,
      contactsActive: run.contacts_with_activity,
      opportunitiesSeen: run.opportunities_seen,
      opportunitiesValued: run.opportunities_with_value,
      paymentsSeen: run.payments_seen,
      appointmentsSeen: run.appointments_seen,
      messagesSeen: run.messages_seen,
    });
    if (next.done) {
      await db.rpc("reporting_grade_baseline", { p_run_id: runId });
      await db.rpc("complete_baseline_run", { p_run_id: runId, p_activate: false });
      ghlLog("baseline.completed", { orgId: run.org_id, runId });
      return { claimed: 1, advanced: 1, completed: 1, failed: 0 };
    }
    return { claimed: 1, advanced: 1, completed: 0, failed: 0 };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "backfill_failed";
    await db.rpc("fail_baseline_run", { p_run_id: runId, p_error: message });
    ghlError("baseline.failed", { orgId: run.org_id, error: message });
    return { claimed: 1, advanced: 0, completed: 0, failed: 1 };
  }
}

async function advanceBackfill(
  db: GhlDb,
  args: {
    runId: string;
    orgId: string;
    locationId: string;
    windowStart: string;
    windowEnd: string;
    progress: Progress;
    deadline: number;
    contactsSeen: number;
    contactsDated: number;
    contactsActive: number;
    opportunitiesSeen: number;
    opportunitiesValued: number;
    paymentsSeen: number;
    appointmentsSeen: number;
    messagesSeen: number;
  }
): Promise<{ done: boolean }> {
  const progress = { ...args.progress };
  if (progress.phase === "queued") progress.phase = "contacts";

  while (Date.now() < args.deadline) {
    const allowed = await consumeRate(db, args.orgId);
    if (!allowed) {
      await saveProgress(db, args, progress);
      return { done: false };
    }

    if (progress.phase === "contacts") {
      const page = await searchContactsPage(db, args.orgId, args.locationId, progress.contactPage ?? 1);
      const inWindow = page.contacts.filter((contact) => inRange(contact.createdAt, args.windowStart, args.windowEnd) || !contact.createdAt);
      await upsertContacts(db, args, inWindow);
      args.contactsSeen += inWindow.length;
      args.contactsDated += inWindow.filter((row) => row.createdAt).length;
      progress.contactPage = (progress.contactPage ?? 1) + 1;
      if (!page.hasMore) {
        progress.phase = "opportunities";
        progress.opportunityStartAfter = null;
      }
      continue;
    }

    if (progress.phase === "opportunities") {
      const page = await searchOpportunitiesPage(
        db,
        args.orgId,
        args.locationId,
        progress.opportunityStartAfter ?? null
      );
      await upsertOpportunities(db, args, page.rows);
      args.opportunitiesSeen += page.rows.length;
      args.opportunitiesValued += page.rows.filter((row) => row.won && row.monetaryValue && row.monetaryValue > 0).length;
      if (!page.next) {
        progress.phase = "appointments";
        progress.calendarIndex = 0;
      } else {
        progress.opportunityStartAfter = page.next;
      }
      continue;
    }

    if (progress.phase === "appointments") {
      const calendars = await listCalendars(db, args.orgId, args.locationId);
      const index = progress.calendarIndex ?? 0;
      if (index >= calendars.length) {
        progress.phase = "messages";
        progress.conversationAfter = null;
        continue;
      }
      const events = await listCalendarEvents(
        db,
        args.orgId,
        args.locationId,
        calendars[index],
        Date.parse(args.windowStart),
        Date.parse(args.windowEnd)
      );
      await upsertAppointments(db, args, events);
      args.appointmentsSeen += events.length;
      progress.calendarIndex = index + 1;
      continue;
    }

    if (progress.phase === "messages") {
      const page = await searchConversationsPage(
        db,
        args.orgId,
        args.locationId,
        progress.conversationAfter ?? null
      );
      for (const conversation of page.ids) {
        if (Date.now() >= args.deadline) break;
        const ok = await consumeRate(db, args.orgId);
        if (!ok) {
          await saveProgress(db, args, progress);
          return { done: false };
        }
        const messages = await listConversationMessages(db, args.orgId, conversation.id);
        await upsertMessages(db, args, conversation.contactId, messages);
        args.messagesSeen += messages.length;
      }
      if (!page.next) {
        await deriveFirstHumanTouch(db, args.orgId, args.runId);
        await recountActivity(db, args);
        progress.phase = "grading";
        await saveProgress(db, args, progress);
        return { done: true };
      }
      progress.conversationAfter = page.next;
      continue;
    }

    return { done: true };
  }

  await saveProgress(db, args, progress);
  return { done: false };
}

async function saveProgress(
  db: GhlDb,
  args: {
    runId: string;
    contactsSeen: number;
    contactsDated: number;
    contactsActive: number;
    opportunitiesSeen: number;
    opportunitiesValued: number;
    paymentsSeen: number;
    appointmentsSeen: number;
    messagesSeen: number;
  },
  progress: Progress
) {
  await db
    .from("baseline_runs")
    .update({
      progress,
      contacts_seen: args.contactsSeen,
      contacts_with_created_date: args.contactsDated,
      contacts_with_activity: args.contactsActive,
      opportunities_seen: args.opportunitiesSeen,
      opportunities_with_value: args.opportunitiesValued,
      payments_seen: args.paymentsSeen,
      appointments_seen: args.appointmentsSeen,
      messages_seen: args.messagesSeen,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", args.runId);
}

function inRange(value: string | null, start: string, end: string): boolean {
  if (!value) return false;
  return value >= start && value < end;
}

async function upsertContacts(
  db: GhlDb,
  args: { orgId: string; runId: string; windowStart: string; windowEnd: string },
  contacts: HistoryContact[]
) {
  if (contacts.length === 0) return;
  const rows = contacts.map((contact) => ({
    org_id: args.orgId,
    run_id: args.runId,
    ghl_contact_id: contact.id,
    created_at_crm: contact.createdAt,
    source: contact.source,
    campaign: contact.campaign,
  }));
  const { error } = await db.from("baseline_leads").upsert(rows, { onConflict: "org_id,ghl_contact_id" });
  if (error) throw error;
}

async function leadIdByContact(db: GhlDb, orgId: string, contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  const { data } = await db
    .from("baseline_leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("ghl_contact_id", contactId)
    .maybeSingle();
  return data?.id ?? null;
}

async function upsertOpportunities(
  db: GhlDb,
  args: { orgId: string; runId: string },
  rows: Awaited<ReturnType<typeof searchOpportunitiesPage>>["rows"]
) {
  for (const row of rows) {
    if (!row.won) continue;
    const leadId = await leadIdByContact(db, args.orgId, row.contactId);
    const cents =
      row.monetaryValue && row.monetaryValue > 0 ? Math.round(row.monetaryValue * 100) : null;
    const { error } = await db.from("baseline_revenue").insert({
      org_id: args.orgId,
      run_id: args.runId,
      baseline_lead_id: leadId,
      amount_cents: cents,
      currency: row.currency.toLowerCase(),
      occurred_at: row.occurredAt,
      source: "opportunity",
      ghl_opportunity_id: row.id,
    });
    if (error && error.code !== "23505") throw error;
  }
}

async function upsertAppointments(
  db: GhlDb,
  args: { orgId: string; runId: string },
  rows: Awaited<ReturnType<typeof listCalendarEvents>>
) {
  for (const row of rows) {
    const leadId = await leadIdByContact(db, args.orgId, row.contactId);
    if (!leadId) continue;
    const { error } = await db.from("baseline_calls").insert({
      org_id: args.orgId,
      run_id: args.runId,
      baseline_lead_id: leadId,
      scheduled_at: row.scheduledAt,
      occurred_at: row.occurredAt,
      outcome: row.outcome,
      ghl_appointment_id: row.id,
    });
    if (error && error.code !== "23505") throw error;
  }
}

async function upsertMessages(
  db: GhlDb,
  args: { orgId: string; runId: string },
  fallbackContactId: string | null,
  rows: Awaited<ReturnType<typeof listConversationMessages>>
) {
  for (const row of rows) {
    const leadId = await leadIdByContact(db, args.orgId, row.contactId ?? fallbackContactId);
    if (!leadId) continue;
    const summary =
      row.direction === "inbound"
        ? inboundTouchSummary(row.channel)
        : outboundTouchSummary(row.channel, row.human ? "human" : "system");
    const { error } = await db.from("baseline_touches").insert({
      org_id: args.orgId,
      run_id: args.runId,
      baseline_lead_id: leadId,
      type: row.human ? "human" : "system",
      channel: row.channel,
      direction: row.direction,
      ghl_user_id: row.userId,
      occurred_at: row.occurredAt,
      summary,
    });
    if (error) {
      ghlWarn("baseline.touch_insert_failed", { error: error.message });
    }
  }
}

async function deriveFirstHumanTouch(db: GhlDb, orgId: string, runId: string) {
  const { data: touches } = await db
    .from("baseline_touches")
    .select("baseline_lead_id, occurred_at")
    .eq("org_id", orgId)
    .eq("run_id", runId)
    .eq("type", "human")
    .eq("direction", "outbound")
    .order("occurred_at", { ascending: true });
  const first = new Map<string, string>();
  for (const row of touches ?? []) {
    if (!first.has(row.baseline_lead_id)) first.set(row.baseline_lead_id, row.occurred_at);
  }
  for (const [leadId, at] of first) {
    await db.from("baseline_leads").update({ first_human_touch_at: at }).eq("id", leadId);
  }
}

async function recountActivity(
  db: GhlDb,
  args: { orgId: string; runId: string; contactsActive: number }
) {
  const { count } = await db
    .from("baseline_leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId)
    .eq("run_id", args.runId)
    .not("first_human_touch_at", "is", null);
  args.contactsActive = count ?? 0;
}
