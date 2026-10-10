"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function applyForSalesOperator(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = String(form.get("fullName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();
  const availability = String(form.get("availability") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Enter your first and last name." };
  if (!email.includes("@")) return { ok: false, error: "Enter an email address." };
  const client = (await createClient()) as unknown as SupabaseClient;
  const { error } = await client.rpc("talent_apply", {
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_timezone: timezone,
    p_availability: availability,
    p_note: note,
  });
  if (error) {
    if (error.message.includes("already with the team")) return { ok: false, error: "This application is already with the team." };
    if (error.message.includes("name") || error.message.includes("email")) return { ok: false, error: error.message };
    return { ok: false, error: "Could not save the application." };
  }
  return { ok: true };
}
