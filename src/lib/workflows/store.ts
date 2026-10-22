import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EditorContext } from "@/lib/workflows/editor-context";
import type { CheckContext, WorkflowGraph } from "@/lib/workflows/types";

export type WorkflowRow = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "proposed" | "published" | "paused" | "archived";
  updatedAt: string;
  liveCount: number;
};

export type WorkflowDetail = WorkflowRow & {
  versionId: string | null;
  version: number | null;
  versionStatus: string | null;
  note: string;
  draftedBy: "person" | "compass" | "template" | null;
  graph: WorkflowGraph;
};

const EMPTY_GRAPH: WorkflowGraph = { boxes: [], edges: [] };

export async function workflowsEnabled(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await supabase
    .from("workspace_flags")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("flag", "workflows")
    .maybeSingle();
  return data?.enabled === true;
}

/** Workflows with how many leads are in each right now, from enrollment rows. */
export async function listWorkflows(supabase: SupabaseClient, orgId: string): Promise<WorkflowRow[]> {
  const [books, live] = await Promise.all([
    supabase
      .from("playbooks")
      .select("id, name, description, status, updated_at")
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("workflow_enrollments").select("playbook_id").eq("org_id", orgId).neq("status", "ended"),
  ]);
  const counts = new Map<string, number>();
  for (const row of live.data ?? []) counts.set(row.playbook_id, (counts.get(row.playbook_id) ?? 0) + 1);
  return (books.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    updatedAt: row.updated_at,
    liveCount: counts.get(row.id) ?? 0,
  }));
}

/** The version people are looking at: the newest draft or proposal, else the published one. */
export async function loadWorkflow(supabase: SupabaseClient, orgId: string, id: string): Promise<WorkflowDetail | null> {
  const { data: book } = await supabase
    .from("playbooks")
    .select("id, name, description, status, updated_at, published_version_id")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!book) return null;
  const { data: versions } = await supabase
    .from("playbook_versions")
    .select("id, version, status, graph, note, drafted_by")
    .eq("org_id", orgId)
    .eq("playbook_id", id)
    .order("version", { ascending: false })
    .limit(10);
  const open = (versions ?? []).find((v) => v.status === "draft" || v.status === "proposed" || v.status === "pending_confirmation");
  const published = (versions ?? []).find((v) => v.id === book.published_version_id);
  const shown = open ?? published ?? (versions ?? [])[0] ?? null;
  const { count } = await supabase
    .from("workflow_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("playbook_id", id)
    .neq("status", "ended");
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    status: book.status,
    updatedAt: book.updated_at,
    liveCount: count ?? 0,
    versionId: shown?.id ?? null,
    version: shown?.version ?? null,
    versionStatus: shown?.status ?? null,
    note: shown?.note ?? "",
    draftedBy: shown?.drafted_by ?? null,
    graph: (shown?.graph as WorkflowGraph | undefined) ?? EMPTY_GRAPH,
  };
}

/**
 * What the checker may look things up in, from real workspace data. Snippets
 * and talk tracks come with Playbook Studio, so until then every draft box
 * reports its content as missing. Channels are left out because their
 * availability is not read here yet, and the checker says so.
 */
export async function loadCheckContext(supabase: SupabaseClient, orgId: string): Promise<CheckContext> {
  const [stages, members] = await Promise.all([
    supabase.from("lead_stage_history").select("to_stage").eq("org_id", orgId).not("to_stage", "is", null).limit(2000),
    supabase.from("org_members").select("id").eq("org_id", orgId).eq("active", true),
  ]);
  return {
    stages: new Set((stages.data ?? []).map((row) => row.to_stage as string)),
    snippetIds: new Set(),
    talkTrackIds: new Set(),
    memberIds: new Set((members.data ?? []).map((row) => row.id as string)),
    roles: new Set(["owner", "admin", "closer", "setter"]),
  };
}

/**
 * The same facts as the check context, with names, for the editor's menus.
 * Snippets and talk tracks stay empty until Playbook Studio fills them, and
 * channel availability and routing stay unknown, so the checker says so.
 */
export async function loadEditorContext(supabase: SupabaseClient, orgId: string): Promise<EditorContext> {
  const [stages, members] = await Promise.all([
    supabase.from("lead_stage_history").select("to_stage").eq("org_id", orgId).not("to_stage", "is", null).limit(2000),
    supabase.from("org_members").select("id, display_name, email").eq("org_id", orgId).eq("active", true).order("display_name"),
  ]);
  return {
    stages: [...new Set((stages.data ?? []).map((row) => row.to_stage as string))].sort(),
    snippets: [],
    talkTracks: [],
    members: (members.data ?? []).map((row) => ({ id: row.id as string, name: (row.display_name as string) || (row.email as string) })),
    roles: ["owner", "admin", "closer", "setter"],
    channels: null,
    routingAvailable: null,
    unhealthyChannels: [],
  };
}

/**
 * Keep the edited graph as the workflow's open draft: update the draft or
 * proposal in place, or start a new draft version after the published one.
 * Never publishes. The data policies allow owners and admins to write drafts
 * and proposals only, so a published version cannot change here either.
 */
export async function saveDraftGraph(
  supabase: SupabaseClient,
  input: { orgId: string; playbookId: string; memberId: string; graph: WorkflowGraph }
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  const { data: versions, error } = await supabase
    .from("playbook_versions")
    .select("id, version, status")
    .eq("org_id", input.orgId)
    .eq("playbook_id", input.playbookId)
    .order("version", { ascending: false })
    .limit(20);
  if (error) return { ok: false, message: "The draft could not be saved. Try again in a moment." };
  const open = (versions ?? []).find((row) => row.status === "draft" || row.status === "proposed");
  if (open) {
    const { error: updateError } = await supabase
      .from("playbook_versions")
      .update({ graph: input.graph, status: "draft" })
      .eq("org_id", input.orgId)
      .eq("id", open.id);
    if (updateError) return { ok: false, message: "You do not have permission to change this workflow." };
    return { ok: true, versionId: open.id as string };
  }
  if ((versions ?? []).some((row) => row.status === "pending_confirmation")) {
    return { ok: false, message: "A version is waiting for the owner to confirm it. Changes can be made after that." };
  }
  const next = ((versions ?? [])[0]?.version as number | undefined) ?? 0;
  const { data: created, error: insertError } = await supabase
    .from("playbook_versions")
    .insert({
      org_id: input.orgId,
      playbook_id: input.playbookId,
      version: next + 1,
      status: "draft",
      graph: input.graph,
      drafted_by: "person",
      created_by_member_id: input.memberId,
    })
    .select("id")
    .single();
  if (insertError || !created) return { ok: false, message: "You do not have permission to change this workflow." };
  return { ok: true, versionId: created.id as string };
}
