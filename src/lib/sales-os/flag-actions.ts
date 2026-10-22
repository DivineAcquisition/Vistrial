"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Vistrial staff switch the Sales OS on or off for this workspace. */
export async function setSalesOsFlag(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can change this switch." };
  const db = (await createClient()) as unknown as {
    rpc: (
      fn: string,
      args: { p_org_id: string; p_flag: string; p_enabled: boolean }
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await db.rpc("set_workspace_flag", { p_org_id: ctx.org.id, p_flag: "sales_os", p_enabled: on });
  if (error) return { ok: false, error: "Could not change that. Try again." };
  revalidatePath("/app", "layout");
  revalidatePath("/app/home");
  revalidatePath("/app/command");
  revalidatePath("/app/ask");
  return { ok: true };
}
