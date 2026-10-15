"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function requestSecurityReviewFromHelp(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isPlatformAdmin) return;
  const details = String(formData.get("details") ?? "").trim().slice(0, 2000);
  const db = (await createClient()) as unknown as SupabaseClient;
  await db.rpc("submit_owner_security_review", { p_details: details });
  revalidatePath("/app/help");
}

export async function requestWorkspaceData(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return;
  const db = (await createClient()) as unknown as SupabaseClient;
  await db.rpc("submit_owner_data_request", {
    p_kind: String(formData.get("kind") ?? "export"),
    p_details: String(formData.get("details") ?? ""),
  });
  revalidatePath("/app/help");
}
