import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
