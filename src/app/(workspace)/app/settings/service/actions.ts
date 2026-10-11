"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { dbMessage, staffDb } from "@/lib/staff/db";

export async function setStaffApproval(orgId: string, allowed: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (ctx.role !== "owner" || ctx.org.id !== orgId) return { ok: false, error: "Only an Owner of this workspace can change this." };
  const db = await staffDb();
  const { error } = await db.rpc("set_staff_approval", { p_org_id: orgId, p_allowed: allowed });
  if (error) return { ok: false, error: dbMessage(error, "Could not change staff approvals.") };
  revalidatePath("/app/settings/service");
  return { ok: true };
}
