import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueNotification } from "@/lib/notifications/enqueue";
import { enqueueRelayJob } from "@/lib/relay/run";
import { assignArrivingLead } from "@/lib/routing/assign";
import { initialEnrollment, releaseWait, stepEnrollment, type EnrollmentState, type LeadSignals } from "@/lib/workflows/engine";
import { boxById, edgesFrom, entryKey, previewLine, startBox, stepPlace } from "@/lib/workflows/graph";
import { proposalWorkflows, seedWorkflows } from "@/lib/workflows/templates";
import { LIMITS, type Box, type Graph, type Snippet } from "@/lib/workflows/types";

type Loose = SupabaseClient;

type PlaybookRow = {
  id: string;
  org_id: string;
  name: string;
  status: string;
  priority: number;
  version: number;
  graph: Graph;
  snippets: Snippet[];
  published_at: string | null;
};

type EnrollmentRow = {
  id: string;
  org_id: string;
  playbook_id: string;
  version: number;
  lead_id: string;
  box_id: string;
  status: EnrollmentState["status"];
  acted: boolean;
  passes: Record<string, number>;
  next_due_at: string | null;
  relay_dedupe_key: string | null;
  step_entered_at: string;
};

export async function seedWorkspaceWorkflows(db: Loose, orgId: string): Promise<number> {
  const { count } = await db.from("playbooks").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) > 0) return 0;
  const rows = seedWorkflows().map((seed, index) => ({
    org_id: orgId,
    template_key: seed.key,
    name: seed.name,
    description: seed.description,
    status: proposalWorkflows().some((item) => item.key === seed.key) ? "proposed" : "draft",
    priority: (index + 1) * 10,
    graph: seed.document.graph,
    snippets: seed.document.snippets,
    origin: "template",
    drafted_by_label: "Drafted by Compass",
  }));
  const { error } = await db.from("playbooks").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function advanceWorkflows(db: Loose): Promise<{ enrolled: number; advanced: number }> {
  const { data: flags } = await db.from("workspace_flags").select("org_id").eq("flag", "workflows").eq("enabled", true).limit(200);
  let enrolled = 0;
  let advanced = 0;
  for (const flag of (flags ?? []) as Array<{ org_id: string }>) {
    const result = await advanceOrg(db, flag.org_id);
    enrolled += result.enrolled;
    advanced += result.advanced;
  }
  return { enrolled, advanced };
}

async function advanceOrg(db: Loose, orgId: string): Promise<{ enrolled: number; advanced: number }> {
  const { data } = await db.from("playbooks").select("id, org_id, name, status, priority, version, graph, snippets, published_at").eq("org_id", orgId).eq("status", "published").order("priority").limit(LIMITS.published);
  const playbooks = ((data ?? []) as PlaybookRow[]).map(normalize);
  let enrolled = 0;
  for (const playbook of playbooks) {
    enrolled += await enrollNew(db, playbook, playbooks);
  }
  const { data: due } = await db
    .from("playbook_enrollments")
    .select("id, org_id, playbook_id, version, lead_id, box_id, status, acted, passes, next_due_at, relay_dedupe_key, step_entered_at")
    .eq("org_id", orgId)
    .in("status", ["active", "needs_attention"])
    .order("next_due_at", { ascending: true, nullsFirst: true })
    .limit(40);
  let advanced = 0;
  for (const row of (due ?? []) as EnrollmentRow[]) {
    const playbook = playbooks.find((item) => item.id === row.playbook_id);
    if (!playbook) continue;
    const moved = await advanceOne(db, playbook, row);
    if (moved) advanced += 1;
  }
  return { enrolled, advanced };
}

async function enrollNew(db: Loose, playbook: PlaybookRow, all: PlaybookRow[]): Promise<number> {
  const start = startBox(playbook.graph);
  if (!start || start.config.type !== "start") return 0;
  const since = await entrySince(db, playbook);
  const { data: leads } = await db
    .from("leads")
    .select("id, status, source, created_at, do_not_contact, pipeline_stage, last_touch_at, assigned_setter_id, assigned_closer_id")
    .eq("org_id", playbook.org_id)
    .eq("is_test", false)
    .gte("created_at", since)
    .limit(80);
  const historic = await historicIds(db, playbook.org_id);
  const held = start.config.type === "start" && start.config.entry.kind === "booking" && start.config.entry.event === "completed" ? await heldLeadIds(db, playbook.org_id, since) : new Set<string>();
  const day = await daily(db, playbook.org_id);
  let added = 0;
  for (const lead of (leads ?? []) as Array<Record<string, unknown>>) {
    if (day.enrollments + added >= LIMITS.draftsPerDay) break;
    const id = String(lead.id);
    if (historic.has(id)) continue;
    if (lead.do_not_contact === true) continue;
    if (lead.status === "closed_won" || lead.status === "closed_lost") continue;
    if (!matchesEntry(start, lead, since, held)) continue;
    const { count } = await db.from("playbook_enrollments").select("id", { count: "exact", head: true }).eq("org_id", playbook.org_id).eq("lead_id", id).in("status", ["active", "paused", "needs_attention"]);
    if ((count ?? 0) >= LIMITS.enrollmentsPerLead) continue;
    const { data: open } = await db.from("playbook_enrollments").select("playbook_id").eq("org_id", playbook.org_id).eq("lead_id", id).in("status", ["active", "paused", "needs_attention"]);
    const blocked = ((open ?? []) as Array<{ playbook_id: string }>).some((row) => {
      const other = all.find((item) => item.id === row.playbook_id);
      if (!other) return false;
      const otherStart = startBox(other.graph);
      return otherStart ? entryKey(otherStart) === entryKey(start) && other.priority <= playbook.priority : false;
    });
    if (blocked) continue;
    const state = initialEnrollment(playbook.graph);
    if (!state) continue;
    const label = boxById(playbook.graph, state.boxId);
    const { error } = await db.from("playbook_enrollments").insert({
      org_id: playbook.org_id,
      playbook_id: playbook.id,
      version: playbook.version,
      lead_id: id,
      box_id: state.boxId,
      workflow_name: playbook.name,
      step_label: label?.title ?? "Start",
      next_label: label ? previewLine(label) : "",
      status: "active",
      acted: false,
      passes: {},
    });
    if (!error) added += 1;
  }
  if (added) await bump(db, playbook.org_id, "enrollments", added);
  return added;
}

function matchesEntry(start: Box, lead: Record<string, unknown>, since: string, held: Set<string>): boolean {
  if (start.config.type !== "start") return false;
  const entry = start.config.entry;
  if (entry.kind === "manual") return false;
  if (entry.kind === "new_lead") return String(lead.created_at) >= since && (lead.status === "new" || lead.status === "working");
  if (entry.kind === "stage") return lead.status === entry.stage || lead.pipeline_stage === entry.stage;
  if (entry.kind === "quiet_days") {
    const last = Date.parse(String(lead.last_touch_at ?? lead.created_at));
    return Number.isFinite(last) && Date.now() - last >= entry.days * 86_400_000;
  }
  if (entry.kind === "booking" && entry.event === "missed") return lead.status === "no_show";
  if (entry.kind === "booking" && entry.event === "made") return lead.status === "call_booked";
  if (entry.kind === "booking" && entry.event === "completed") return held.has(String(lead.id));
  return false;
}

async function heldLeadIds(db: Loose, orgId: string, since: string): Promise<Set<string>> {
  const { data } = await db.from("calls").select("lead_id").eq("org_id", orgId).eq("outcome", "held").gte("occurred_at", since).limit(200);
  return new Set(((data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));
}

async function advanceOne(db: Loose, playbook: PlaybookRow, row: EnrollmentRow): Promise<boolean> {
  const signals = await loadSignals(db, playbook.org_id, row.lead_id, row.box_id);
  let enrollment: EnrollmentState = {
    boxId: row.box_id,
    status: row.status === "needs_attention" ? "active" : row.status,
    endReason: null,
    acted: row.acted,
    passes: row.passes ?? {},
  };
  if (signals.optedOut || signals.doNotContact || signals.closed) {
    const result = stepEnrollment(playbook.graph, { ...enrollment, status: "active" }, signals, "none");
    await saveEnrollment(db, playbook, row, result.enrollment, null);
    return true;
  }
  const box = boxById(playbook.graph, enrollment.boxId);
  if (!box) {
    await saveEnrollment(db, playbook, row, { ...enrollment, status: "needs_attention" }, "The step is no longer on this workflow.");
    return true;
  }
  if (box.type === "wait") {
    const due = row.next_due_at ? Date.parse(row.next_due_at) : null;
    if (due === null) {
      await saveEnrollment(db, playbook, row, enrollment, null, nextDue(box));
      return false;
    }
    if (due > Date.now()) return false;
    const released = releaseWait(playbook.graph, enrollment);
    enrollment = released.enrollment;
  }
  const draftState = await draftStateFor(db, playbook.org_id, row);
  const result = stepEnrollment(playbook.graph, enrollment, signals, draftState);
  const capped = await applyEffects(db, playbook, row, result.effects);
  const landed = boxById(playbook.graph, result.enrollment.boxId);
  const due = landed?.type === "wait" ? nextDue(landed) : null;
  await saveEnrollment(db, playbook, row, result.enrollment, capped, due);
  return result.moved || result.effects.length > 0;
}

async function applyEffects(db: Loose, playbook: PlaybookRow, row: EnrollmentRow, effects: ReturnType<typeof stepEnrollment>["effects"]): Promise<string | null> {
  for (const effect of effects) {
    if (effect.type === "draft") {
      const day = await daily(db, playbook.org_id);
      if (day.drafts >= LIMITS.draftsPerDay) {
        await notifyCap(db, playbook.org_id, day.cap_notified);
        return "Today's draft limit is reached. This lead waits until tomorrow.";
      }
      const snippet = playbook.snippets.find((item) => item.key === effect.snippetKey);
      const key = `workflow:${row.lead_id}:${effect.boxId}`;
      await enqueueRelayJob({
        orgId: playbook.org_id,
        leadId: row.lead_id,
        trigger: "workflow",
        dedupeKey: key,
        contextNote: `${effect.channel}:${snippet?.label ?? effect.snippetKey}`,
      });
      await db.from("playbook_enrollments").update({ relay_dedupe_key: key }).eq("id", row.id);
      await bump(db, playbook.org_id, "drafts", 1);
    }
    if (effect.type === "task") {
      const day = await daily(db, playbook.org_id);
      if (day.tasks >= LIMITS.tasksPerDay) {
        await notifyCap(db, playbook.org_id, day.cap_notified);
        return "Today's task limit is reached. This lead waits until tomorrow.";
      }
      await insertTask(db, playbook.org_id, row.lead_id, effect);
      await bump(db, playbook.org_id, "tasks", 1);
    }
    if (effect.type === "route") {
      const day = await daily(db, playbook.org_id);
      if (day.routes >= LIMITS.routesPerDay) {
        await notifyCap(db, playbook.org_id, day.cap_notified);
        return "Today's routing limit is reached. This lead waits until tomorrow.";
      }
      if (effect.mode === "assign_unowned") await assignArrivingLead(db as never, { orgId: playbook.org_id, leadId: row.lead_id });
      await bump(db, playbook.org_id, "routes", 1);
    }
  }
  return null;
}

async function insertTask(db: Loose, orgId: string, leadId: string, effect: Extract<ReturnType<typeof stepEnrollment>["effects"][number], { type: "task" }>): Promise<void> {
  const { data: settings } = await db.from("routing_settings").select("agent_tasks").eq("org_id", orgId).maybeSingle();
  const direct = (settings as { agent_tasks?: string } | null)?.agent_tasks === "direct";
  const { data: owner } = await db.from("org_members").select("id, user_id").eq("org_id", orgId).eq("role", "owner").limit(1).maybeSingle();
  const ownerRow = owner as { id?: string; user_id?: string } | null;
  const assignee = effect.assignee === "person" ? effect.personId : ownerRow?.id ?? null;
  const purpose = effect.purpose.slice(0, 80);
  const { data: existing } = await db.from("next_actions").select("id").eq("org_id", orgId).eq("lead_id", leadId).eq("purpose_key", `playbook:${purpose}`).in("status", ["suggested", "open", "snoozed"]).maybeSingle();
  if (existing) return;
  await db.from("next_actions").insert({
    org_id: orgId,
    lead_id: leadId,
    action_text: effect.title.slice(0, 240),
    owner_member_id: assignee,
    due_at: new Date(Date.now() + effect.dueHours * 3_600_000).toISOString(),
    created_by: "system",
    task_type: "follow_up",
    status: direct ? "open" : "suggested",
    source_kind: "playbook",
    source_sentence: `From a workflow: ${effect.title}`.slice(0, 300),
    purpose_key: `playbook:${purpose}`,
  });
  if (effect.notify && ownerRow?.user_id) {
    await enqueueNotification(db as never, {
      orgId,
      eventType: "task_suggested",
      channel: "push",
      subjectKind: "task",
      recipientUserId: ownerRow.user_id,
      recipientMemberId: ownerRow.id ?? null,
      subjectIds: [leadId],
      title: "Task from a workflow",
      body: effect.title.slice(0, 140),
      href: `/app/cases/${leadId}`,
      dedupeKey: `workflow-task:${leadId}:${purpose}`,
      leadId,
    }).catch(() => null);
  }
}

async function draftStateFor(db: Loose, orgId: string, row: EnrollmentRow): Promise<"none" | "pending" | "approved" | "expired" | "skipped"> {
  if (!row.acted || !row.relay_dedupe_key) return "none";
  const { data: job } = await db.from("relay_jobs").select("id, status").eq("org_id", orgId).eq("dedupe_key", row.relay_dedupe_key).maybeSingle();
  const found = job as { id?: string; status?: string } | null;
  if (!found) return "pending";
  if (found.status === "skipped" || found.status === "dead") return "expired";
  if (found.status !== "done") return "pending";
  const { data: item } = await db.from("approval_items").select("status").eq("org_id", orgId).eq("dedupe_key", `relay:${found.id}`).maybeSingle();
  const status = (item as { status?: string } | null)?.status;
  if (status === "pending" || status === "approved") return status === "approved" ? "approved" : "pending";
  if (status === "expired" || status === "dismissed" || status === "failed") return "expired";
  return "pending";
}

async function saveEnrollment(db: Loose, playbook: PlaybookRow, row: EnrollmentRow, enrollment: EnrollmentState, attention: string | null, due: string | null = null): Promise<void> {
  const box = boxById(playbook.graph, enrollment.boxId);
  const place = stepPlace(playbook.graph, enrollment.boxId);
  const next = box ? nextWords(playbook.graph, box, due) : "";
  await db.from("playbook_enrollments").update({
    box_id: enrollment.boxId,
    status: attention ? "needs_attention" : enrollment.status,
    end_reason: enrollment.endReason,
    acted: enrollment.acted,
    passes: enrollment.passes,
    next_due_at: due,
    step_entered_at: enrollment.boxId === row.box_id ? row.step_entered_at : new Date().toISOString(),
    step_label: box ? `Step ${place.index} of ${place.total}. ${box.title}` : "Needs attention",
    next_label: attention ?? next,
    attention,
  }).eq("id", row.id);
  if (enrollment.status === "finished" || attention) {
    await db.from("playbook_events").insert({
      org_id: playbook.org_id,
      playbook_id: playbook.id,
      enrollment_id: row.id,
      lead_id: row.lead_id,
      box_id: enrollment.boxId,
      kind: attention ? "attention" : "advanced",
      note: attention ?? enrollment.endReason,
    });
  }
}

function nextWords(graph: Graph, box: Box, due: string | null): string {
  if (box.type === "wait" && due) return `Waiting until ${due.slice(0, 16).replace("T", " ")} UTC.`;
  const edge = edgesFrom(graph, box.id).find((item) => item.port === "next" || item.port === "yes");
  return edge ? `Next: ${edge.label}.` : previewLine(box);
}

function nextDue(box: Box): string | null {
  if (box.config.type !== "wait") return null;
  const at = new Date(Date.now() + box.config.hours * 3_600_000);
  if (box.config.untilHour === null) return at.toISOString();
  return at.toISOString();
}

async function loadSignals(db: Loose, orgId: string, leadId: string, boxId: string): Promise<LeadSignals> {
  const [{ data: lead }, { data: opt }, { data: touch }, { data: openApproval }, { data: openTask }] = await Promise.all([
    db.from("leads").select("status, source, do_not_contact, assigned_setter_id, assigned_closer_id, pipeline_stage").eq("id", leadId).eq("org_id", orgId).maybeSingle(),
    db.from("lead_opt_outs").select("lead_id").eq("lead_id", leadId).eq("org_id", orgId).maybeSingle(),
    db.from("touches").select("direction, type, occurred_at").eq("org_id", orgId).eq("lead_id", leadId).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("approval_items").select("id").eq("org_id", orgId).eq("agent_id", "relay").in("status", ["pending", "approved"]).contains("lead_ids", [leadId]).limit(1),
    db.from("next_actions").select("id").eq("org_id", orgId).eq("lead_id", leadId).eq("purpose_key", `playbook:workflow:${boxId}`).in("status", ["suggested", "open", "snoozed"]).limit(1),
  ]);
  const row = lead as { status?: string; source?: string | null; do_not_contact?: boolean; assigned_setter_id?: string | null; assigned_closer_id?: string | null; pipeline_stage?: string | null } | null;
  const last = touch as { direction?: string; type?: string } | null;
  return {
    optedOut: Boolean(opt),
    doNotContact: row?.do_not_contact === true,
    closed: row?.status === "closed_won" || row?.status === "closed_lost",
    closedWon: row?.status === "closed_won",
    repliedSinceStep: last?.direction === "inbound",
    booking: row?.status === "no_show" ? "missed" : row?.status === "call_booked" ? "in_place" : "none",
    stage: row?.status ?? row?.pipeline_stage ?? null,
    tier: null,
    source: row?.source ?? null,
    service: null,
    hasOwner: Boolean(row?.assigned_setter_id || row?.assigned_closer_id),
    humanTouchedRecently: last?.type === "human",
    pendingDraft: Array.isArray(openApproval) ? openApproval.length > 0 : Boolean(openApproval),
    openTaskPurpose: Array.isArray(openTask) ? openTask.length > 0 : Boolean(openTask),
    autoReassign: false,
  };
}

async function entrySince(db: Loose, playbook: PlaybookRow): Promise<string> {
  const { data } = await db.from("workspace_connections").select("go_live_at").eq("org_id", playbook.org_id).not("go_live_at", "is", null).order("go_live_at", { ascending: true }).limit(1).maybeSingle();
  const goLive = (data as { go_live_at?: string } | null)?.go_live_at;
  const published = playbook.published_at ?? new Date().toISOString();
  if (goLive && Date.parse(goLive) > Date.parse(published)) return goLive;
  return published;
}

async function historicIds(db: Loose, orgId: string): Promise<Set<string>> {
  const { data } = await db.from("lead_import_marks").select("lead_id").eq("org_id", orgId).is("reactivated_at", null).limit(5000);
  return new Set(((data ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));
}

async function daily(db: Loose, orgId: string): Promise<{ drafts: number; tasks: number; routes: number; enrollments: number; cap_notified: boolean }> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("workflow_daily").select("drafts, tasks, routes, enrollments, cap_notified").eq("org_id", orgId).eq("day", day).maybeSingle();
  return (data as { drafts: number; tasks: number; routes: number; enrollments: number; cap_notified: boolean } | null) ?? { drafts: 0, tasks: 0, routes: 0, enrollments: 0, cap_notified: false };
}

async function bump(db: Loose, orgId: string, field: "drafts" | "tasks" | "routes" | "enrollments", by: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const current = await daily(db, orgId);
  await db.from("workflow_daily").upsert({ org_id: orgId, day, ...current, [field]: current[field] + by }, { onConflict: "org_id,day" });
}

async function notifyCap(db: Loose, orgId: string, already: boolean): Promise<void> {
  if (already) return;
  const day = new Date().toISOString().slice(0, 10);
  await db.from("workflow_daily").upsert({ org_id: orgId, day, cap_notified: true }, { onConflict: "org_id,day" });
  await db.from("playbook_events").insert({ org_id: orgId, kind: "capped", note: "A daily workflow limit was reached." });
}

function normalize(row: PlaybookRow): PlaybookRow {
  return { ...row, graph: row.graph as Graph, snippets: (row.snippets ?? []) as Snippet[] };
}

export function publishSummary(name: string, matching: number): string {
  return `${name} will watch for new leads that match its start after you publish. ${matching} current lead${matching === 1 ? "" : "s"} would match, and none of them are enrolled unless you enroll existing leads separately. It will not message anyone by itself. Every text or email is a draft you approve. Quiet hours stay 8:00 AM to 8:00 PM in the lead's time. A draft that expires follows the Expired exit, or it stops.`;
}

export function stripLine(name: string, stepLabel: string, nextLabel: string): string {
  return `${name}. ${stepLabel}. ${nextLabel}`;
}
