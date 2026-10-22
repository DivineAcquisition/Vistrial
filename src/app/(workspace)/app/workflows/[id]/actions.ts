"use server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LIMITS } from "@/lib/workflows/types";
import { parseWorkflowGraph } from "@/lib/workflows/schema";
import { saveDraftGraph, workflowsEnabled } from "@/lib/workflows/store";

/**
 * Autosave from the editor. Refuses anything outside the allowed box types and
 * settings, and only ever writes a draft. Publishing is a separate step with a
 * note, the checker and a preview, and is not part of this action.
 */
export async function saveWorkflowDraft(playbookId: string, graph: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) return { ok: false, message: "Only the owner can change workflows." };
  const supabase = await createClient();
  if (!(await workflowsEnabled(supabase, ctx.org.id))) return { ok: false, message: "Workflows are not switched on for this workspace." };
  const parsed = parseWorkflowGraph(graph);
  if (!parsed.ok) return parsed;
  if (parsed.graph.boxes.length > DEFAULT_LIMITS.maxBoxes) {
    return { ok: false, message: `A workflow can have at most ${DEFAULT_LIMITS.maxBoxes} boxes.` };
  }
  const result = await saveDraftGraph(supabase, { orgId: ctx.org.id, playbookId, memberId: ctx.member.id, graph: parsed.graph });
  return result.ok ? { ok: true } : result;
}
