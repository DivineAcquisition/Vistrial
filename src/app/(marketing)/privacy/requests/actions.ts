"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanText } from "@/lib/access-requests/validate";
import { requestIp } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type LeadNoteState = { ok: boolean; message: string };

export async function submitLeadNote(_prev: LeadNoteState, form: FormData): Promise<LeadNoteState> {
  const email = cleanText(form.get("email"), 200);
  const details = cleanText(form.get("details"), 2000);
  if (!email.includes("@") || !details) {
    return { ok: false, message: "Enter an email and what should change." };
  }
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    const { data, error } = await db.rpc("submit_lead_data_note", {
      p_name: cleanText(form.get("name"), 120),
      p_email: email,
      p_business: cleanText(form.get("business"), 160),
      p_details: details,
      p_ip: requestIp(await headers()),
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return { ok: false, message: "We could not save that just now. Try again in a moment." };
    }
  } catch {
    return { ok: false, message: "We could not save that just now. Try again in a moment." };
  }
  return { ok: true, message: "Received. We will pass this to the business when we can tell who they are." };
}
