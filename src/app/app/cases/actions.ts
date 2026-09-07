"use server";

import { canAssignLeadTo } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { CaseListCursor, CaseTimelineCursor } from "@/lib/cases/cursor";
import { isLeadId } from "@/lib/cases/filters";
import { fetchOrgCaseFile, fetchOrgCaseList, fetchOrgCaseTimeline } from "@/lib/cases/load";
import {
  CASE_PAGE_SIZE,
  type CaseActionResult,
  type CaseFilePayload,
  type CaseListFilters,
  type CaseListPayload,
  type CaseTimelinePage,
} from "@/lib/cases/types";
import { MANUAL_LEAD_STATUSES, type LeadStatus } from "@/lib/leads/labels";
import { revalidateLeadSurfaces } from "@/lib/leads/revalidate";
import { createClient } from "@/lib/supabase/server";
import {
  encodeLeadFileContents,
  isAllowedLeadFileType,
  MAX_CONTEXT_NOTES_CHARS,
  MAX_LEAD_FILE_BYTES,
  sanitizeLeadFileName,
} from "@/lib/cases/files";

function actionError(error: string): CaseActionResult {
  return { ok: false, error };
}

function explainWriteError(message: string | undefined, fallback: string): string {
  const text = message ?? "";
  if (text.toLowerCase().includes("closed_won follows a recorded payment")) {
    return "Closed won follows a recorded payment. It cannot be set by hand.";
  }
  if (text.toLowerCase().includes("not authorized to reassign")) {
    return "You can assign this lead to yourself, but not to someone else.";
  }
  if (text.toLowerCase().includes("row-level security") || text.toLowerCase().includes("42501")) {
    return "You do not have permission to do that.";
  }
  if (text.toLowerCase().includes("lead not found") || text.toLowerCase().includes("not authorized")) {
    return "That lead is not in this workspace.";
  }
  return fallback;
}

function isManualStatus(value: string): value is Exclude<LeadStatus, "closed_won"> {
  return (MANUAL_LEAD_STATUSES as readonly string[]).includes(value);
}

async function requireLeadInOrg(leadId: string): Promise<
  | { ok: true; orgId: string; leadId: string }
  | { ok: false; error: string }
> {
  if (!isLeadId(leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "That lead is not in this workspace." };
  return { ok: true, orgId: ctx.org.id, leadId };
}

export async function refreshCaseList(
  filters: CaseListFilters,
  opts?: { cursor?: CaseListCursor | null; limit?: number }
): Promise<CaseListPayload> {
  return fetchOrgCaseList(
    await createClient(),
    (await getAuthContext()).org.id,
    filters,
    { cursor: opts?.cursor ?? null, limit: opts?.limit ?? CASE_PAGE_SIZE }
  );
}

export async function refreshCaseFile(leadId: string): Promise<CaseFilePayload | null> {
  if (!isLeadId(leadId)) return null;
  return fetchOrgCaseFile(await createClient(), (await getAuthContext()).org.id, leadId);
}

export async function loadCaseTimelinePage(
  leadId: string,
  cursor: CaseTimelineCursor | null
): Promise<CaseTimelinePage | null> {
  if (!isLeadId(leadId)) return null;
  const ctx = await getAuthContext();
  return fetchOrgCaseTimeline(await createClient(), ctx.org.id, leadId, cursor);
}

export async function changeLeadStatus(input: {
  leadId: string;
  status: string;
  note: string;
}): Promise<CaseActionResult> {
  const scoped = await requireLeadInOrg(input.leadId);
  if (!scoped.ok) return scoped;
  if (!isManualStatus(input.status)) {
    return actionError("Closed won follows a recorded payment. Pick another status.");
  }
  const note = input.note.trim();
  if (!note) return actionError("Say why the status is changing. An unexplained change looks like a bug later.");
  if (note.length > 280) return actionError("Keep the note under 280 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_org_lead_status", {
    p_org_id: scoped.orgId,
    p_lead_id: scoped.leadId,
    p_status: input.status,
    p_note: note,
  });
  if (error) {
    return actionError(explainWriteError(error.message, "Could not change that status."));
  }
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}

export async function resolveLeadObjection(input: {
  leadId: string;
  objectionId: string;
  note: string;
}): Promise<CaseActionResult> {
  const scoped = await requireLeadInOrg(input.leadId);
  if (!scoped.ok) return scoped;
  if (!isLeadId(input.objectionId)) return actionError("That objection is not on this lead.");
  const note = input.note.trim();
  if (!note) return actionError("Add a note so the next closer knows what resolved it.");
  if (note.length > 280) return actionError("Keep the note under 280 characters.");

  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objections")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_note: note,
      resolved_by_member_id: ctx.member.id,
    })
    .eq("org_id", scoped.orgId)
    .eq("lead_id", scoped.leadId)
    .eq("id", input.objectionId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not resolve that objection."));
  }
  if (!data) return actionError("That objection is not on this lead.");
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}

export async function reassignLeadNextAction(input: {
  leadId: string;
  nextActionId: string;
  ownerMemberId: string | null;
}): Promise<CaseActionResult> {
  const scoped = await requireLeadInOrg(input.leadId);
  if (!scoped.ok) return scoped;
  if (!isLeadId(input.nextActionId)) return actionError("That next action is not on this lead.");

  const ctx = await getAuthContext();
  const supabase = await createClient();
  const ownerId = input.ownerMemberId || null;

  if (ownerId) {
    if (!isLeadId(ownerId)) return actionError("The owner must be an active member of this workspace.");
    const allowed = canAssignLeadTo({
      role: ctx.role,
      actorMemberId: ctx.member.id,
      targetMemberId: ownerId,
      isPlatformAdmin: ctx.isPlatformAdmin,
    });
    if (!allowed) {
      return actionError("You can assign this action to yourself, but not to someone else.");
    }
    const { data: owner, error: ownerError } = await supabase
      .from("org_members")
      .select("id, active")
      .eq("org_id", scoped.orgId)
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError || !owner || !owner.active) {
      return actionError("The owner must be an active member of this workspace.");
    }
  } else {
    const allowed = canAssignLeadTo({
      role: ctx.role,
      actorMemberId: ctx.member.id,
      targetMemberId: null,
      isPlatformAdmin: ctx.isPlatformAdmin,
    });
    if (!allowed) {
      return actionError("You can assign this action to yourself, but not unassign it.");
    }
  }

  const { data, error } = await supabase
    .from("next_actions")
    .update({ owner_member_id: ownerId })
    .eq("org_id", scoped.orgId)
    .eq("lead_id", scoped.leadId)
    .eq("id", input.nextActionId)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not reassign that next action."));
  }
  if (!data) return actionError("That next action is not on this lead.");
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}

export async function saveLeadContextNotes(input: {
  leadId: string;
  notes: string;
}): Promise<CaseActionResult> {
  const scoped = await requireLeadInOrg(input.leadId);
  if (!scoped.ok) return scoped;
  if (input.notes.length > MAX_CONTEXT_NOTES_CHARS) {
    return actionError(`Keep context notes under ${MAX_CONTEXT_NOTES_CHARS.toLocaleString()} characters.`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ context_notes: input.notes, updated_at: new Date().toISOString() })
    .eq("org_id", scoped.orgId)
    .eq("id", scoped.leadId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not save those notes."));
  }
  if (!data) return actionError("You can edit notes on leads assigned to you.");
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}

export async function uploadLeadFile(formData: FormData): Promise<CaseActionResult> {
  const leadId = String(formData.get("leadId") ?? "");
  const scoped = await requireLeadInOrg(leadId);
  if (!scoped.ok) return scoped;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return actionError("Choose a file to attach.");
  }
  if (file.size > MAX_LEAD_FILE_BYTES) {
    return actionError("Files must be 8 MB or smaller.");
  }
  const contentType = file.type || "application/octet-stream";
  if (!isAllowedLeadFileType(contentType)) {
    return actionError("That file type is not allowed. Use PDF, text, image, audio, or Word.");
  }

  const ctx = await getAuthContext();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = await createClient();
  const { error } = await supabase.from("lead_files").insert({
    org_id: scoped.orgId,
    lead_id: scoped.leadId,
    file_name: sanitizeLeadFileName(file.name),
    content_type: contentType,
    byte_size: file.size,
    contents: encodeLeadFileContents(bytes),
    uploaded_by_member_id: ctx.member.id,
  });
  if (error) {
    return actionError(explainWriteError(error.message, "Could not attach that file."));
  }
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}

export async function deleteLeadFile(input: {
  leadId: string;
  fileId: string;
}): Promise<CaseActionResult> {
  const scoped = await requireLeadInOrg(input.leadId);
  if (!scoped.ok) return scoped;
  if (!isLeadId(input.fileId)) return actionError("That file is not on this lead.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_files")
    .delete()
    .eq("org_id", scoped.orgId)
    .eq("lead_id", scoped.leadId)
    .eq("id", input.fileId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(explainWriteError(error.message, "Could not remove that file."));
  }
  if (!data) return actionError("That file is not on this lead.");
  revalidateLeadSurfaces(scoped.leadId);
  return { ok: true };
}
