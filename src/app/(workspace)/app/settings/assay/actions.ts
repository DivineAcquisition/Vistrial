"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Loose = SupabaseClient;

export async function setQueueOrderForm(formData: FormData): Promise<void> {
  const mode = formData.get("mode") === "oldest" ? "oldest" : "best";
  await setQueueOrder(mode);
}

export async function setQueueOrder(mode: "best" | "oldest"): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as Loose;
  const { error } = await db.from("assay_queue_prefs").upsert({ org_id: ctx.org.id, member_id: ctx.member.id, mode });
  if (error) return { ok: false, error: "Could not save that order." };
  revalidatePath("/app/queue");
  revalidatePath("/app/today");
  revalidatePath("/app/cases");
  return { ok: true };
}

export async function requestAssayChangeForm(formData: FormData): Promise<void> {
  await requestAssayChange(String(formData.get("note") ?? ""));
}

export async function confirmAssayWritebackForm(): Promise<void> {
  await confirmAssayWriteback();
}

export async function requestAssayChange(note: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole === "operator" && !ctx.isStaff) return { ok: false, error: "Ask an owner to request this." };
  const text = note.trim();
  if (text.length < 3) return { ok: false, error: "Write a short note." };
  const db = (await createClient()) as unknown as Loose;
  const { error } = await db.from("assay_change_requests").insert({ org_id: ctx.org.id, member_id: ctx.member.id, note: text.slice(0, 500) });
  if (error) return { ok: false, error: "Could not send that request." };
  revalidatePath("/app/team/assay");
  return { ok: true };
}

export async function confirmAssayWriteback(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) return { ok: false, error: "Only an owner can confirm this." };
  const admin = getSupabaseAdmin() as unknown as Loose;
  const { data } = await admin.from("assay_writeback").select("enabled").eq("org_id", ctx.org.id).maybeSingle();
  if (!(data as { enabled?: boolean } | null)?.enabled) return { ok: false, error: "Writeback is not turned on yet." };
  const { error } = await admin.from("assay_writeback").update({ owner_confirmed_at: new Date().toISOString() }).eq("org_id", ctx.org.id);
  if (error) return { ok: false, error: "Could not confirm writeback." };
  revalidatePath("/app/settings/assay");
  return { ok: true };
}
