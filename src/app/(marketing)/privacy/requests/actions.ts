"use server";

import { cleanText } from "@/lib/access-requests/validate";
import { capturePublicRequest } from "@/lib/marketing/capture";

export type LeadNoteState = { ok: boolean; message: string };

export async function submitLeadNote(_prev: LeadNoteState, form: FormData): Promise<LeadNoteState> {
  const email = cleanText(form.get("email"), 200);
  const details = cleanText(form.get("details"), 2000);
  if (!email.includes("@") || !details) {
    return { ok: false, message: "Enter an email and what should change." };
  }
  if (cleanText(form.get("company_website_confirm"), 200)) {
    return { ok: true, message: "Received. We will pass this to the business when we can tell who they are." };
  }
  const saved = await capturePublicRequest({
    kind: "lead_data_note",
    email,
    name: cleanText(form.get("name"), 120),
    detail: [cleanText(form.get("business"), 160), details].filter(Boolean).join("\n"),
  });
  if (!saved.ok) return { ok: false, message: saved.message };
  return { ok: true, message: "Received. We will pass this to the business when we can tell who they are." };
}
