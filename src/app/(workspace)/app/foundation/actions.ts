"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { draftFoundation } from "@/lib/foundation/draft";
import { FIELD_BY_KEY, fieldProblem } from "@/lib/foundation/fields";
import { loadDraftInputs } from "@/lib/foundation/store";
import { salesOsEnabled } from "@/lib/sales-os/flag";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; message: string };

async function editor(): Promise<{ db: SupabaseClient; orgId: string; owner: boolean } | { error: string }> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { error: "The Sales OS is not switched on for this workspace." };
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) return { error: "Only an Owner can change the foundation." };
  return { db: (await createClient()) as unknown as SupabaseClient, orgId: ctx.org.id, owner: ctx.workspaceRole === "owner" };
}

function friendly(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  return /only an owner|vistrial team|add a short note|nothing to confirm/i.test(message) ? message : fallback;
}

/** Compass fills every field nobody has edited, each with its source. */
export async function draftFoundationAction(): Promise<Result> {
  const who = await editor();
  if ("error" in who) return { ok: false, message: who.error };
  const draft = draftFoundation(await loadDraftInputs(who.db, who.orgId));
  const fields: Record<string, { value: unknown; source: string }> = {};
  for (const [key, entry] of draft) {
    if (fieldProblem(key, entry.value)) continue;
    fields[key] = { value: entry.value, source: entry.source };
  }
  const { data, error } = await who.db.rpc("foundation_save_draft", { p_org_id: who.orgId, p_fields: fields });
  if (error) return { ok: false, message: friendly(error.message, "Compass could not draft the foundation. Try again.") };
  revalidatePath("/app/foundation");
  const count = Number(data ?? 0);
  return { ok: true, message: count === 0 ? "Every field already has your answer. Nothing was replaced." : `Compass drafted ${count} fields. Check them, then confirm.` };
}

export async function saveFoundationField(key: string, value: unknown): Promise<Result> {
  const who = await editor();
  if ("error" in who) return { ok: false, message: who.error };
  if (!FIELD_BY_KEY.has(key)) return { ok: false, message: "That field does not exist." };
  const problem = fieldProblem(key, value);
  if (problem) return { ok: false, message: problem };
  const { error } = await who.db.rpc("foundation_save_field", { p_org_id: who.orgId, p_key: key, p_value: value });
  if (error) return { ok: false, message: friendly(error.message, "That did not save. Try again.") };
  revalidatePath("/app/foundation");
  revalidatePath("/app/command");
  return { ok: true };
}

export async function confirmFoundationAction(note: string): Promise<Result> {
  const who = await editor();
  if ("error" in who) return { ok: false, message: who.error };
  if (!who.owner) return { ok: false, message: "Only an Owner can confirm the foundation. The Vistrial team can draft and edit it for you." };
  const trimmed = note.trim().slice(0, 500);
  if (!trimmed) return { ok: false, message: "Add a short note about what changed." };
  const { data, error } = await who.db.rpc("foundation_confirm", { p_org_id: who.orgId, p_note: trimmed });
  if (error) return { ok: false, message: friendly(error.message, "That did not confirm. Try again.") };
  revalidatePath("/app/foundation");
  revalidatePath("/app/command");
  return { ok: true, message: `Version ${Number(data)} confirmed.` };
}
