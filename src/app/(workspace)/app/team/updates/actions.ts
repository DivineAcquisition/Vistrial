"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const AREAS = new Set(["home", "results", "leads", "agents", "team", "billing", "general"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function adminDb(): Promise<SupabaseClient | SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { status: "error", error: "Only a Platform Admin can publish updates." };
  return (await createClient()) as unknown as SupabaseClient;
}

export async function publishUpdate(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const db = await adminDb();
  if ("status" in db) return db;
  const ctx = await getAuthContext();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || title.length > 140) return { status: "error", error: "Give it a title, under 140 characters." };
  if (!body || body.length > 2000) return { status: "error", error: "Write what changed, under 2,000 characters." };
  const area = String(formData.get("area") ?? "");
  const when = String(formData.get("published_at") ?? "").trim();
  const published = when ? new Date(when) : new Date();
  if (Number.isNaN(published.getTime())) return { status: "error", error: "That date is not valid." };

  const { error } = await db.from("product_updates").insert({
    title,
    body,
    area: AREAS.has(area) ? area : null,
    published_at: published.toISOString(),
    created_by: ctx.user.id,
  });
  if (error) return { status: "error", error: "Could not publish it." };
  revalidatePath("/app/team/updates");
  revalidatePath("/app/help");
  return { status: "saved" };
}

export async function removeUpdate(id: string): Promise<SettingsSaveResult> {
  if (!UUID.test(id)) return { status: "error", error: "That update was not found." };
  const db = await adminDb();
  if ("status" in db) return db;
  const { error } = await db.from("product_updates").delete().eq("id", id);
  if (error) return { status: "error", error: "Could not remove it." };
  revalidatePath("/app/team/updates");
  revalidatePath("/app/help");
  return { status: "saved" };
}
