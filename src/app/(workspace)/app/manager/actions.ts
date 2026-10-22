"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { localDay } from "@/lib/manager/eod";
import { draftEods } from "@/lib/manager/store";
import { isTeamManager, salesOsEnabled } from "@/lib/sales-os/flag";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; message: string };

export async function draftTodayAction(): Promise<Result> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { ok: false, message: "The Sales OS is not switched on for this workspace." };
  if (!(await isTeamManager(ctx.org.id))) return { ok: false, message: "Only a manager can draft team reports." };
  const db = (await createClient()) as unknown as SupabaseClient;
  try {
    const count = await draftEods(db, ctx.org.id, localDay(Date.now(), ctx.org.timezone), ctx.org.timezone);
    revalidatePath("/app/manager");
    return { ok: true, message: count === 1 ? "1 report drafted." : `${count} reports drafted. Confirmed reports were left as they are.` };
  } catch {
    return { ok: false, message: "The reports could not be drafted. Try again." };
  }
}

export async function confirmEodAction(reportId: string, note: string): Promise<Result> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { ok: false, message: "The Sales OS is not switched on for this workspace." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("eod_confirm", { p_report_id: reportId, p_note: note.slice(0, 2000) });
  if (error) return { ok: false, message: /only the rep/i.test(error.message) ? "Only you can confirm your own report." : "That did not confirm. Try again." };
  revalidatePath("/app/manager");
  revalidatePath("/app/command");
  return { ok: true, message: "Report confirmed." };
}
