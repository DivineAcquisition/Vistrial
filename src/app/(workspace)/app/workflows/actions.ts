"use server";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { planAllowsWorkflows, workflowPowers } from "@/lib/workflows/access";
import { checkDocument } from "@/lib/workflows/checker";
import { initialEnrollment } from "@/lib/workflows/engine";
import { boxById, startBox } from "@/lib/workflows/graph";
import { acceptProposal, draftAllowance } from "@/lib/workflows/propose";
import { publishSummary, seedWorkspaceWorkflows } from "@/lib/workflows/run";
import { proposalWorkflows } from "@/lib/workflows/templates";
import { LIMITS, type PlaybookDocument } from "@/lib/workflows/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function loose(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

async function gate(need: "view" | "edit" | "publish" | "proposePublish" | "confirm" | "enrollExisting" | "manageFlag") {
  const ctx = await getAuthContext();
  const db = loose(await createClient());
  const { data: plan } = await db.from("billing_accounts").select("plan_id").eq("org_id", ctx.org.id).maybeSingle();
  if (!planAllowsWorkflows((plan as { plan_id?: string } | null)?.plan_id ?? null)) {
    return { ctx, db, error: "Workflows are not included on this plan." as const };
  }
  const { data: manager } = await db.from("workflow_managers").select("member_id").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle();
  const powers = workflowPowers(ctx.workspaceRole, Boolean(manager));
  if (need !== "manageFlag") {
    const { data: flag } = await db.from("workspace_flags").select("enabled").eq("org_id", ctx.org.id).eq("flag", "workflows").maybeSingle();
    if (!(flag as { enabled?: boolean } | null)?.enabled && need !== "view") {
      return { ctx, db, error: "Workflows are switched off for this workspace." as const };
    }
  }
  if (!powers[need]) return { ctx, db, error: "You cannot do that." as const };
  return { ctx, db, error: null, powers };
}

export async function saveWorkflow(id: string, document: PlaybookDocument): Promise<ActionResult> {
  const { ctx, db, error } = await gate("edit");
  if (error || !db) return { ok: false, error: error ?? "You cannot do that." };
  const { error: saveError } = await db
    .from("playbooks")
    .update({ graph: document.graph, snippets: document.snippets, status: "draft" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .in("status", ["draft", "proposed", "pending_confirmation"]);
  if (saveError) return { ok: false, error: "Could not save this draft." };
  revalidatePath(`/app/workflows/${id}`);
  return { ok: true };
}

export async function publishWorkflow(id: string, note: string, matching: number): Promise<ActionResult> {
  const trimmed = note.trim();
  if (trimmed.length < 2) return { ok: false, error: "Add a short note." };
  const ctx = await getAuthContext();
  const db = loose(await createClient());
  const { data: manager } = await db.from("workflow_managers").select("member_id").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle();
  const powers = workflowPowers(ctx.workspaceRole, Boolean(manager));
  const { data: row } = await db.from("playbooks").select("graph, snippets, name, version, status").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!row) return { ok: false, error: "That workflow is not in this workspace." };
  const document = { graph: (row as { graph: PlaybookDocument["graph"] }).graph, snippets: (row as { snippets: PlaybookDocument["snippets"] }).snippets ?? [] };
  const checked = checkDocument(document);
  if (!checked.ok) return { ok: false, error: checked.errors[0]?.message ?? "This workflow still has a problem." };
  const version = Number((row as { version: number }).version) + ((row as { status: string }).status === "published" ? 1 : 0);
  if (powers.publish) {
    const { error } = await db
      .from("playbooks")
      .update({ status: "published", publish_note: trimmed, version: Math.max(version, 1), published_by: ctx.user.id, published_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", ctx.org.id);
    if (error) return { ok: false, error: "Could not publish. The note is required, and only an Owner can publish." };
    const admin = loose(getSupabaseAdmin());
    await admin.rpc("halt_org_follow_up_sequences", { p_org_id: ctx.org.id, p_actor: ctx.member.id });
    await admin.from("playbook_events").insert({ org_id: ctx.org.id, playbook_id: id, kind: "published", note: trimmed, actor: ctx.user.id });
    revalidatePath("/app/workflows");
    return { ok: true, message: publishSummary(String((row as { name: string }).name), matching) };
  }
  if (!powers.proposePublish) return { ok: false, error: "You cannot publish this." };
  const { error } = await db
    .from("playbooks")
    .update({ status: "pending_confirmation", publish_note: trimmed, version: Math.max(version, 1) })
    .eq("id", id)
    .eq("org_id", ctx.org.id);
  if (error) return { ok: false, error: "Could not send this to the Owner." };
  revalidatePath("/app/workflows");
  return { ok: true, message: "Sent to the Owner to confirm. Nothing runs until they publish it." };
}

export async function confirmWorkflow(id: string): Promise<ActionResult> {
  const { ctx, db, error } = await gate("confirm");
  if (error || !db) return { ok: false, error: error ?? "You cannot do that." };
  const { error: saveError } = await db
    .from("playbooks")
    .update({ status: "published", published_by: ctx.user.id, published_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .eq("status", "pending_confirmation");
  if (saveError) return { ok: false, error: "Could not confirm this workflow." };
  const admin = loose(getSupabaseAdmin());
  await admin.rpc("halt_org_follow_up_sequences", { p_org_id: ctx.org.id, p_actor: ctx.member.id });
  revalidatePath("/app/workflows");
  return { ok: true, message: "Published. New matching leads can enter. Existing leads stay out until you enroll them." };
}

export async function pauseWorkflow(id: string, paused: boolean): Promise<ActionResult> {
  const { ctx, db, error } = await gate("publish");
  if (error || !db) return { ok: false, error: error ?? "You cannot do that." };
  const { error: saveError } = await db.from("playbooks").update({ status: paused ? "paused" : "published" }).eq("id", id).eq("org_id", ctx.org.id);
  if (saveError) return { ok: false, error: "Could not change this workflow." };
  await loose(getSupabaseAdmin()).from("playbook_events").insert({ org_id: ctx.org.id, playbook_id: id, kind: paused ? "paused" : "resumed", actor: ctx.user.id, note: paused ? "Paused" : "Resumed" });
  revalidatePath("/app/workflows");
  return { ok: true };
}

export async function enableWorkflows(): Promise<void> {
  await setWorkflowsEnabled(true);
}

export async function requestDraw(): Promise<void> {
  await drawWorkflows();
}

export async function setWorkflowsEnabled(enabled: boolean): Promise<ActionResult> {
  const { ctx, error } = await gate("manageFlag");
  if (error) return { ok: false, error };
  const admin = loose(getSupabaseAdmin());
  const { error: flagError } = await admin.rpc("set_workspace_flag", { p_org_id: ctx.org.id, p_flag: "workflows", p_enabled: enabled });
  if (flagError) return { ok: false, error: "Could not change the switch." };
  if (enabled) await seedWorkspaceWorkflows(admin as never, ctx.org.id).catch(() => 0);
  revalidatePath("/app/workflows");
  return { ok: true, message: enabled ? "Workflows are on. Review the drawings before you publish any of them." : "Workflows are off." };
}

export async function drawWorkflows(): Promise<ActionResult> {
  const { ctx, db, error } = await gate("edit");
  if (error || !db) return { ok: false, error: error ?? "You cannot do that." };
  const day = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db.from("workflow_draws").select("full_runs, last_single_at").eq("org_id", ctx.org.id).eq("day", day).maybeSingle();
  const row = usage as { full_runs?: number; last_single_at?: string | null } | null;
  const allowance = draftAllowance({ fullRunsToday: row?.full_runs ?? 0, lastSingleAt: row?.last_single_at ?? null, now: Date.now(), single: false });
  if (!allowance.ok) return { ok: false, error: allowance.message };
  const admin = loose(getSupabaseAdmin());
  await seedWorkspaceWorkflows(admin as never, ctx.org.id);
  const context = { snippetKeys: [], stages: ["new", "working", "call_booked", "no_show", "follow_up", "objection_hold", "closed_won", "closed_lost"], people: [], textAllowed: true, emailAllowed: true, published: [], priority: 10 };
  for (const seed of proposalWorkflows()) {
    const accepted = acceptProposal(seed.document, { ...context, snippetKeys: seed.document.snippets.map((item) => item.key) });
    if (!accepted) return { ok: false, error: "Compass could not draw a valid workflow, so nothing was shown." };
  }
  await admin.from("workflow_draws").upsert({ org_id: ctx.org.id, day, full_runs: (row?.full_runs ?? 0) + 1 }, { onConflict: "org_id,day" });
  revalidatePath("/app/workflows");
  return { ok: true, message: "Compass drew your sales process. Review it." };
}

export async function pauseThisLead(enrollmentId: string): Promise<void> {
  await enrollmentAction(enrollmentId, "pause", "Paused for this lead.");
}

export async function takeOverLead(enrollmentId: string): Promise<void> {
  await enrollmentAction(enrollmentId, "take_over", "A person took over.");
}

export async function skipThisStep(enrollmentId: string): Promise<void> {
  await enrollmentAction(enrollmentId, "skip", "Skipped this step.");
}

export async function enrollmentAction(enrollmentId: string, action: "take_over" | "pause" | "skip", reason: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  const db = loose(await createClient());
  const { data: manager } = await db.from("workflow_managers").select("member_id").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle();
  const powers = workflowPowers(ctx.workspaceRole, Boolean(manager));
  if (action === "skip" && !powers.skip) return { ok: false, error: "You cannot skip a step." };
  if (action !== "skip" && !powers.takeOver && !powers.pauseLead) return { ok: false, error: "You cannot do that." };
  const { data: row } = await db.from("playbook_enrollments").select("id, playbook_id, box_id, status").eq("id", enrollmentId).eq("org_id", ctx.org.id).maybeSingle();
  if (!row) return { ok: false, error: "That lead is not in a workflow you can see." };
  if (action === "pause") {
    const { error } = await db.from("playbook_enrollments").update({ status: "paused", attention: reason.slice(0, 200) || "Paused for this lead." }).eq("id", enrollmentId);
    if (error) return { ok: false, error: "Could not pause this lead." };
  } else if (action === "take_over") {
    const { error } = await db.from("playbook_enrollments").update({ status: "finished", end_reason: "stopped", attention: reason.slice(0, 200) || "A person took over." }).eq("id", enrollmentId);
    if (error) return { ok: false, error: "Could not take over this lead." };
  } else {
    const { data: playbook } = await db.from("playbooks").select("graph").eq("id", (row as { playbook_id: string }).playbook_id).maybeSingle();
    const graph = (playbook as { graph?: PlaybookDocument["graph"] } | null)?.graph;
    const box = graph ? boxById(graph, (row as { box_id: string }).box_id) : null;
    const next = graph && box ? graph.edges.find((edge) => edge.source === box.id && edge.port === "next") : null;
    if (!next) return { ok: false, error: "The checker does not have a next step to skip to." };
    const target = boxById(graph!, next.target);
    const { error } = await db.from("playbook_enrollments").update({ box_id: next.target, acted: false, step_label: target?.title ?? "Next step" }).eq("id", enrollmentId);
    if (error) return { ok: false, error: "Could not skip this step." };
  }
  await loose(getSupabaseAdmin()).from("playbook_events").insert({
    org_id: ctx.org.id,
    playbook_id: (row as { playbook_id: string }).playbook_id,
    enrollment_id: enrollmentId,
    box_id: (row as { box_id: string }).box_id,
    kind: action === "skip" ? "skipped" : "take_over",
    note: reason.slice(0, 200) || action,
    actor: ctx.user.id,
  });
  revalidatePath("/app/workflows");
  return { ok: true };
}

export async function enrollExisting(id: string): Promise<ActionResult> {
  const { ctx, db, error } = await gate("enrollExisting");
  if (error || !db) return { ok: false, error: error ?? "You cannot do that." };
  const admin = loose(getSupabaseAdmin());
  const { data: playbook } = await admin.from("playbooks").select("id, name, graph, version, status").eq("id", id).eq("org_id", ctx.org.id).eq("status", "published").maybeSingle();
  if (!playbook) return { ok: false, error: "Publish the workflow before enrolling existing leads." };
  const graph = (playbook as { graph: PlaybookDocument["graph"] }).graph;
  const state = initialEnrollment(graph);
  const start = startBox(graph);
  if (!state || !start) return { ok: false, error: "This workflow has no start." };
  const { data: leads } = await admin
    .from("leads")
    .select("id, status, do_not_contact")
    .eq("org_id", ctx.org.id)
    .eq("is_test", false)
    .limit(200);
  let added = 0;
  for (const lead of (leads ?? []) as Array<{ id: string; status: string; do_not_contact: boolean }>) {
    if (added >= LIMITS.enrollExistingPerDay) break;
    if (lead.do_not_contact || lead.status === "closed_won" || lead.status === "closed_lost") continue;
    const { error: insertError } = await admin.from("playbook_enrollments").insert({
      org_id: ctx.org.id,
      playbook_id: id,
      version: (playbook as { version: number }).version,
      lead_id: lead.id,
      box_id: state.boxId,
      workflow_name: String((playbook as { name?: string }).name ?? "Workflow"),
      step_label: boxById(graph, state.boxId)?.title ?? "Start",
      next_label: "Enrolled from existing leads.",
      status: "active",
    });
    if (!insertError) added += 1;
  }
  await admin.from("playbook_events").insert({ org_id: ctx.org.id, playbook_id: id, kind: "enrolled", note: `Enrolled ${added} existing leads.`, actor: ctx.user.id });
  revalidatePath(`/app/workflows/${id}`);
  return { ok: true, message: `Enrolled ${added} existing leads today. Opted out, do-not-contact, and closed leads were left out. The rest wait for tomorrow's pace.` };
}
